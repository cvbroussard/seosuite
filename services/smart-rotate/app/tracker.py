"""
Subject tracking for video reframing.

Per `project_tracpost_smart_rotate_self_host.md`:
1. YOLOv8 — per-frame subject bounding box detection
2. Identity persistence — match the same subject across frames so the
   crop window follows ONE subject, not jumps
3. Kalman filter — smooth the bounding box center coordinates so the
   resulting "camera path" looks intentional, not jerky
4. Multi-subject handling — pick the dominant subject (largest +
   most-central) when multiple are present

This module produces a list of (frame_index, crop_center_x, crop_center_y)
tuples. The reframe module consumes these to drive FFmpeg crop coords.
"""
import logging
from dataclasses import dataclass
from typing import Iterator

import cv2
import numpy as np
from filterpy.kalman import KalmanFilter
from ultralytics import YOLO

from .config import Config

log = logging.getLogger(__name__)


@dataclass
class CropPath:
    """Per-frame crop center coordinates for the reframe operation."""
    frames: list[tuple[int, float, float]]  # (frame_idx, center_x_norm, center_y_norm)
    source_width: int
    source_height: int
    fps: float
    total_frames: int
    subjects_tracked: int
    detection_rate: float  # fraction of frames where a subject was found


def make_kalman() -> KalmanFilter:
    """
    2D Kalman filter for crop-center coordinates. State is [x, y, vx, vy];
    measurement is [x, y]. Tuned for moderate smoothing — adjust
    Q (process noise) up for more responsiveness, down for more smoothing.
    """
    kf = KalmanFilter(dim_x=4, dim_z=2)
    kf.F = np.array([[1, 0, 1, 0],
                     [0, 1, 0, 1],
                     [0, 0, 1, 0],
                     [0, 0, 0, 1]], dtype=float)
    kf.H = np.array([[1, 0, 0, 0],
                     [0, 1, 0, 0]], dtype=float)
    kf.P *= 1000.0       # initial uncertainty
    kf.R = np.eye(2) * 5.0   # measurement noise
    kf.Q = np.eye(4) * 0.5   # process noise — moderate smoothing
    return kf


def pick_primary_subject(
    boxes: np.ndarray,
    classes: np.ndarray,
    confidences: np.ndarray,
    frame_w: int,
    frame_h: int,
) -> tuple[float, float] | None:
    """
    Pick the dominant subject from per-frame YOLO detections.

    Strategy: among detections in PRIMARY_SUBJECT_CLASSES, score by
    (box_area * confidence) with a centrality bonus. Return the chosen
    subject's center as (x_norm, y_norm) in [0, 1].

    Returns None if no eligible subject found in this frame.
    """
    if len(boxes) == 0:
        return None

    primary_mask = np.isin(classes, Config.PRIMARY_SUBJECT_CLASSES)
    if not primary_mask.any():
        return None

    primary_boxes = boxes[primary_mask]
    primary_conf = confidences[primary_mask]

    # Compute per-box: area, center, centrality bonus
    x1, y1, x2, y2 = primary_boxes[:, 0], primary_boxes[:, 1], primary_boxes[:, 2], primary_boxes[:, 3]
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0
    area = (x2 - x1) * (y2 - y1)

    # Distance from frame center, normalized — closer to center = better
    frame_cx, frame_cy = frame_w / 2.0, frame_h / 2.0
    dist = np.sqrt((cx - frame_cx) ** 2 + (cy - frame_cy) ** 2)
    max_dist = np.sqrt(frame_cx ** 2 + frame_cy ** 2)
    centrality = 1.0 - (dist / max_dist)

    # Final score: area-weighted confidence with centrality boost
    scores = (area / (frame_w * frame_h)) * primary_conf * (0.7 + 0.3 * centrality)
    best_idx = int(np.argmax(scores))

    return float(cx[best_idx] / frame_w), float(cy[best_idx] / frame_h)


def track_video(video_path: str) -> CropPath:
    """
    Run YOLOv8 frame-by-frame on the source video, pick the primary
    subject per frame, smooth coordinates with Kalman, return a CropPath.

    Sample stride: detect every Nth frame to bound CPU; interpolate
    the missing frames via Kalman prediction. For 30fps source, every
    3rd frame = 10fps detection rate, plenty for smooth tracking.
    """
    model = YOLO(Config.YOLO_MODEL)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Detect every Nth frame to bound CPU. Interpolate the rest.
    detect_stride = max(1, int(fps / 10))  # aim for ~10 detections per second

    kf = make_kalman()
    kf.x = np.array([0.5, 0.5, 0, 0], dtype=float)  # start at frame center

    frames_out: list[tuple[int, float, float]] = []
    detections_count = 0
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Run detection only on stride frames; predict-only for the rest.
        if frame_idx % detect_stride == 0:
            results = model.predict(
                frame,
                imgsz=640,
                conf=0.35,
                verbose=False,
            )
            r = results[0]
            boxes = r.boxes.xyxy.cpu().numpy() if r.boxes is not None else np.array([])
            classes = r.boxes.cls.cpu().numpy().astype(int) if r.boxes is not None else np.array([])
            confidences = r.boxes.conf.cpu().numpy() if r.boxes is not None else np.array([])

            picked = pick_primary_subject(boxes, classes, confidences, src_w, src_h)
            if picked is not None:
                detections_count += 1
                kf.predict()
                kf.update(np.array([picked[0], picked[1]]))
            else:
                kf.predict()
        else:
            # Between detections, just predict — Kalman smooths through the gaps
            kf.predict()

        x_norm = float(np.clip(kf.x[0], 0.0, 1.0))
        y_norm = float(np.clip(kf.x[1], 0.0, 1.0))
        frames_out.append((frame_idx, x_norm, y_norm))
        frame_idx += 1

    cap.release()

    detection_rate = detections_count / max(1, frame_idx // detect_stride)

    log.info(
        "track_video: %d frames, %.2f fps, %d detections (%.1f%% rate), stride=%d",
        frame_idx, fps, detections_count, detection_rate * 100, detect_stride,
    )

    return CropPath(
        frames=frames_out,
        source_width=src_w,
        source_height=src_h,
        fps=fps,
        total_frames=frame_idx,
        # 1 subject for now; multi-subject tracking is a follow-up enhancement
        subjects_tracked=1 if detections_count > 0 else 0,
        detection_rate=detection_rate,
    )


def crop_path_to_filter_expr(
    path: CropPath,
    target_width: int,
    target_height: int,
) -> str:
    """
    Build an ffmpeg filter expression that applies the per-frame crop.

    Strategy: produce a single average crop center for v1 (since per-
    frame crop with ffmpeg requires sendcmd / metadata frame-by-frame
    which is complex and slow). The smoothed Kalman path gives us a
    stable center; for typical service-business shots (subject in frame
    most of the time), one center is workable. Per-frame ffmpeg crop is
    a follow-up quality bump.

    Returns: a `crop=W:H:X:Y,scale=tw:th` chain.
    """
    if not path.frames:
        # No subject detected anywhere — fall back to center crop
        center_x_norm, center_y_norm = 0.5, 0.5
    else:
        xs = [f[1] for f in path.frames]
        ys = [f[2] for f in path.frames]
        center_x_norm = float(np.mean(xs))
        center_y_norm = float(np.mean(ys))

    # Determine crop dims at source resolution that match target aspect
    target_aspect = target_width / target_height
    src_w = path.source_width
    src_h = path.source_height

    # Fit the largest possible target-aspect rectangle inside the source
    if src_w / src_h > target_aspect:
        # Source is wider than target — height is the limit
        crop_h = src_h
        crop_w = int(crop_h * target_aspect)
    else:
        # Source is taller than target — width is the limit
        crop_w = src_w
        crop_h = int(crop_w / target_aspect)

    # Place the crop window so subject center stays in frame
    desired_cx = center_x_norm * src_w
    desired_cy = center_y_norm * src_h
    crop_x = int(np.clip(desired_cx - crop_w / 2, 0, src_w - crop_w))
    crop_y = int(np.clip(desired_cy - crop_h / 2, 0, src_h - crop_h))

    return f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y},scale={target_width}:{target_height}"
