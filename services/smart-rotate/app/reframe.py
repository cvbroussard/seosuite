"""
End-to-end reframe pipeline.

Orchestrates: download → track → ffmpeg crop+encode → upload to R2.
Owns the temp file lifecycle so the service stays clean across many
concurrent requests.
"""
import asyncio
import logging
import os
import tempfile
import time
from dataclasses import dataclass

import ffmpeg

from .r2 import download_source, upload_result
from .tracker import CropPath, crop_path_to_filter_expr, track_video

log = logging.getLogger(__name__)


@dataclass
class ReframeResult:
    destination_url: str
    duration_seconds: float
    method: str
    frames_processed: int
    subjects_tracked: int
    smoothing_window_frames: int


async def reframe_video(
    source_url: str,
    target_aspect: str,
    target_width: int,
    target_height: int,
    destination_key: str,
) -> ReframeResult:
    """
    Full pipeline. Synchronous from the caller's perspective; runs CPU-
    bound work (YOLO + ffmpeg) inline. The Vercel caller wraps this in
    waitUntil so it tolerates 15-45s wall-clock.
    """
    started = time.monotonic()

    with tempfile.TemporaryDirectory(prefix="smart-rotate-") as tmpdir:
        source_path = os.path.join(tmpdir, "source.mp4")
        output_path = os.path.join(tmpdir, "output.mp4")

        # 1. Download source
        await download_source(source_url, source_path)
        log.info("Downloaded source: %s (%d bytes)",
                 source_url, os.path.getsize(source_path))

        # 2. Run YOLOv8 + Kalman tracking. CPU-bound; offload to thread
        # so the FastAPI event loop stays responsive for /health checks.
        path: CropPath = await asyncio.to_thread(track_video, source_path)
        log.info(
            "Tracked: %d frames @ %.2ffps, detection rate=%.1f%%, subjects=%d",
            path.total_frames, path.fps, path.detection_rate * 100,
            path.subjects_tracked,
        )

        # 3. Build ffmpeg filter from the crop path
        filter_expr = crop_path_to_filter_expr(path, target_width, target_height)
        log.info("FFmpeg filter: %s", filter_expr)

        # 4. Run ffmpeg encode. Preserve audio. Fast preset for beta.
        await asyncio.to_thread(
            _run_ffmpeg_encode,
            source_path,
            output_path,
            filter_expr,
        )
        log.info("Encoded: %d bytes", os.path.getsize(output_path))

        # 5. Upload to R2 at the caller-supplied key
        destination_url = await asyncio.to_thread(
            upload_result, output_path, destination_key, "video/mp4",
        )

        duration = time.monotonic() - started

        return ReframeResult(
            destination_url=destination_url,
            duration_seconds=duration,
            method="smart_rotate_yolov8",
            frames_processed=path.total_frames,
            subjects_tracked=path.subjects_tracked,
            smoothing_window_frames=int(path.fps),  # Kalman effective horizon
        )


def _run_ffmpeg_encode(input_path: str, output_path: str, vfilter: str) -> None:
    """
    Run ffmpeg with the smart-crop filter. libx264 fast preset with
    moderate CRF — quality bias over file size for social posting.
    Audio passes through untouched.
    """
    (
        ffmpeg
        .input(input_path)
        .output(
            output_path,
            vf=vfilter,
            vcodec="libx264",
            preset="fast",
            crf=23,
            acodec="aac",
            audio_bitrate="128k",
            movflags="+faststart",
            pix_fmt="yuv420p",
        )
        .overwrite_output()
        .run(quiet=True)
    )
