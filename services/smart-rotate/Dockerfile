FROM python:3.11-slim

# System deps: ffmpeg for video processing, libgl1 for opencv
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pre-install heavy ML deps so they cache between code-only redeploys
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the YOLOv8 model so cold starts don't pay the download cost
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY app ./app

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
