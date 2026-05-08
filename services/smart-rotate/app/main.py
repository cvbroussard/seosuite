"""
Smart Rotate FastAPI app.

Single endpoint: POST /reframe takes (source URL, target dims, destination
R2 key) and returns the destination URL once the reframe is complete.

Auth: X-Smart-Rotate-Secret header must match SMART_ROTATE_SECRET env.
The Vercel caller (variant-render.ts) sends the same secret it has stored.
"""
import logging

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .config import Config, assert_runtime_config
from .reframe import ReframeResult, reframe_video

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("smart-rotate")

app = FastAPI(title="TracPost Smart Rotate", version="0.1.0")


@app.on_event("startup")
async def _startup():
    assert_runtime_config()
    log.info("Smart Rotate up. Model=%s, smoothing=%d frames",
             Config.YOLO_MODEL, Config.SMOOTHING_WINDOW_FRAMES)


def require_auth(x_smart_rotate_secret: str = Header(default="")):
    if not x_smart_rotate_secret or x_smart_rotate_secret != Config.SMART_ROTATE_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Smart-Rotate-Secret")


class ReframeRequest(BaseModel):
    source_url: str = Field(..., description="Public or presigned URL to the source video")
    target_aspect: str = Field(..., description="e.g. '9:16', '1:1', '16:9' — used for log/audit only; actual dims drive the crop")
    target_width: int = Field(..., ge=1, le=4096)
    target_height: int = Field(..., ge=1, le=4096)
    destination_key: str = Field(..., description="R2 object key to write the result to (sites/.../variants/...mp4)")


class ReframeResponse(BaseModel):
    destination_url: str
    duration_seconds: float
    render_settings: dict


@app.get("/health")
async def health():
    """Liveness check — Fly.io and the variant render worker can probe this."""
    return {
        "ok": True,
        "model": Config.YOLO_MODEL,
        "smoothing_window_frames": Config.SMOOTHING_WINDOW_FRAMES,
    }


@app.post("/reframe", response_model=ReframeResponse, dependencies=[Depends(require_auth)])
async def reframe(req: ReframeRequest):
    log.info("reframe request: %s → %s (target %dx%d, key=%s)",
             req.source_url, req.target_aspect, req.target_width, req.target_height,
             req.destination_key)

    try:
        result: ReframeResult = await reframe_video(
            source_url=req.source_url,
            target_aspect=req.target_aspect,
            target_width=req.target_width,
            target_height=req.target_height,
            destination_key=req.destination_key,
        )
    except Exception as e:
        log.exception("reframe failed")
        # Surface the error message but no stack trace to the caller —
        # service-internal details stay in our logs.
        raise HTTPException(status_code=500, detail=f"Reframe failed: {e}")

    log.info("reframe done in %.2fs: %s",
             result.duration_seconds, result.destination_url)

    return ReframeResponse(
        destination_url=result.destination_url,
        duration_seconds=result.duration_seconds,
        render_settings={
            "method": result.method,
            "frames_processed": result.frames_processed,
            "subjects_tracked": result.subjects_tracked,
            "smoothing_window_frames": result.smoothing_window_frames,
        },
    )
