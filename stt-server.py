"""
Minimal OpenAI-compatible Whisper API server using faster-whisper.
Usage:
  source .venv/bin/activate
  python stt-server.py [--model large-v3] [--port 8080]

Endpoints:
  POST /v1/audio/transcriptions  (OpenAI-compatible)
"""

import argparse
import io
import logging
import tempfile
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Local Whisper STT Server")

# Global model reference (loaded on startup)
_model = None
_model_name = None


def get_model():
    global _model, _model_name
    if _model is None:
        from faster_whisper import WhisperModel

        logger.info(f"Loading model: {_model_name} (this may take a moment on first run)...")
        _model = WhisperModel(
            _model_name,
            device="cpu",
            compute_type="int8",
        )
        logger.info("Model loaded.")
    return _model


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("large-v3"),
    language: str = Form(None),
    response_format: str = Form("json"),
):
    # Save uploaded audio to a temp file (faster-whisper needs a file path)
    audio_bytes = await file.read()
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        whisper = get_model()
        kwargs = {}
        if language:
            kwargs["language"] = language

        segments, info = whisper.transcribe(tmp_path, **kwargs)
        text = "".join(segment.text for segment in segments).strip()

        logger.info(f"Transcribed ({info.language}, {info.duration:.1f}s): {text}")

        return JSONResponse({"text": text})
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@app.get("/v1/models")
async def list_models():
    return {"data": [{"id": _model_name, "object": "model"}]}


@app.get("/health")
async def health():
    # Import check catches broken system-Python orphans that still bind the port.
    try:
        import faster_whisper  # noqa: F401
    except ImportError as e:
        return JSONResponse(
            {"status": "error", "error": str(e)},
            status_code=503,
        )
    return {"status": "ok"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local Whisper STT Server")
    parser.add_argument("--model", default="large-v3", help="Whisper model name (default: large-v3)")
    parser.add_argument("--port", type=int, default=8080, help="Port (default: 8080)")
    parser.add_argument("--host", default="127.0.0.1", help="Host (default: 127.0.0.1)")
    args = parser.parse_args()

    _model_name = args.model

    logger.info(f"Starting STT server on {args.host}:{args.port} with model '{args.model}'")
    logger.info("Model will be downloaded on first request if not cached.")

    uvicorn.run(app, host=args.host, port=args.port)
