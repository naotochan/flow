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
    language: str | None = Form(None),
    response_format: str = Form("json"),
    prompt: str | None = Form(None),
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
        # The client sends an anti-hallucination dictation prompt (see
        # api/whisper.rs). Cloud OpenAI-compatible endpoints honour it; without
        # this the local server silently dropped it as an unknown form field.
        # Note: combined with condition_on_previous_text=False below, this only
        # steers the first 30s window — long dictations lose it after that.
        if prompt:
            kwargs["initial_prompt"] = prompt

        segments, info = whisper.transcribe(
            tmp_path,
            # Strip silence/noise before decoding instead of relying entirely
            # on post-hoc string matching for hallucinations. Also cuts
            # processing time by skipping dead air.
            # threshold is loosened from Silero's 0.5 default to match the
            # deliberately low RMS gate in pipeline.rs: that gate was lowered to
            # let quiet dictation through, and a stock-threshold VAD here would
            # just discard the same quiet speech one stage later.
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500, threshold=0.35),
            # Without this, one hallucinated segment biases the decoder's
            # context for every segment after it, letting it cascade through
            # the rest of the utterance.
            condition_on_previous_text=False,
            **kwargs,
        )

        # No no_speech_prob/avg_logprob check here on purpose: faster-whisper
        # already skips windows where no_speech_prob > 0.6 and avg_logprob
        # <= -1.0 (transcribe.py, "no voice activity check"), so any segment we
        # receive has already passed that exact test — re-testing it would be
        # dead code.
        kept_text = []
        all_text = []
        dropped = 0
        for segment in segments:
            # segments is a generator, so stash every segment's text on the way
            # past: it cannot be replayed for the fallback below.
            all_text.append(segment.text)

            # Runaway repetition is a classic hallucination signature (looping
            # on one phrase over silence).
            #
            # Whisper's stock 2.4 threshold is tuned for English and is too
            # tight for Japanese: measured gzip ratios are ~1.0-1.7 for normal
            # speech but reach ~3.1 for genuine back-channel-heavy utterances
            # ("そうですね、はい、はい…"), while real hallucination loops land
            # at 5.8-16. 3.5 keeps the loops and stops eating real dictation.
            if segment.compression_ratio > 3.5:
                dropped += 1
                logger.debug(
                    f"Dropped repetitive segment (ratio={segment.compression_ratio:.2f}): "
                    f"{segment.text!r}"
                )
                continue
            kept_text.append(segment.text)

        text = "".join(kept_text).strip()
        if dropped:
            logger.info(f"Dropped {dropped} repetitive segment(s)")

        # compression_ratio is computed per 30s decode window, not per segment,
        # so a single bad window can take real speech down with it. If the
        # filter ate everything, it is more likely wrong than the transcript is:
        # fall back to the unfiltered text and let the client-side phrase
        # filter (pipeline.rs) make the final call.
        if not text and dropped:
            text = "".join(all_text).strip()
            if text:
                logger.warning(
                    f"All {dropped} segment(s) filtered; falling back to unfiltered text"
                )

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

    # The client reuses one pooled connection across dictations (see
    # api/mod.rs). uvicorn's 5s default would close those idle sockets long
    # before reqwest evicts them, so keep-alive has to outlive the pool.
    uvicorn.run(app, host=args.host, port=args.port, timeout_keep_alive=120)
