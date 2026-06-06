"""
AI Pipeline router.
STT: faster-whisper  →  txt / srt / json
TTS: kokoro          →  wav / flac
STS: whisper → kokoro (speech-to-speech via transcription + synthesis)
TTT: not yet implemented (requires local LLM)

Models are cached at module level — first call pays load cost, subsequent
calls reuse the same instance.  Thread-safe via threading.Lock guards.
"""

import asyncio
import json
import os
import threading
from pathlib import Path
from datetime import datetime
from typing import TYPE_CHECKING

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from services.job_queue import gpu_queue, Job

if TYPE_CHECKING:
    from faster_whisper import WhisperModel
    from kokoro import KPipeline

router = APIRouter()

WHISPER_MODEL_DIR = os.environ.get(
    "WHISPER_MODEL_DIR",
    r"D:\Ses_Modelleri\whisper",
)


# ── Model cache ────────────────────────────────────────────────────────────

_whisper_lock:  threading.Lock               = threading.Lock()
_whisper_cache: dict[str, "WhisperModel"]   = {}

_kokoro_lock:   threading.Lock               = threading.Lock()
_kokoro_cache:  dict[str, "KPipeline"]      = {}


def _get_whisper(size: str) -> "WhisperModel":
    """Return cached WhisperModel, loading on first call."""
    with _whisper_lock:
        if size not in _whisper_cache:
            import torch
            from faster_whisper import WhisperModel

            device       = "cuda" if torch.cuda.is_available() else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
            _whisper_cache[size] = WhisperModel(
                size,
                device=device,
                compute_type=compute_type,
                download_root=WHISPER_MODEL_DIR,
            )
        return _whisper_cache[size]


def _get_kokoro(lang_code: str = "a") -> "KPipeline":
    """Return cached KPipeline, loading on first call."""
    with _kokoro_lock:
        if lang_code not in _kokoro_cache:
            from kokoro import KPipeline
            _kokoro_cache[lang_code] = KPipeline(lang_code=lang_code)
        return _kokoro_cache[lang_code]


# ── Helpers ────────────────────────────────────────────────────────────────

def _whisper_size(model_id: str) -> str:
    """'whisper-medium' → 'medium'"""
    return model_id.replace("whisper-", "").strip() if model_id else "medium"


def _timestamp(seconds: float) -> str:
    """Float seconds → SRT timestamp 00:00:00,000"""
    h  = int(seconds // 3600)
    m  = int((seconds % 3600) // 60)
    s  = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _segments_to_srt(segments) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        lines.append(str(i))
        lines.append(f"{_timestamp(seg.start)} --> {_timestamp(seg.end)}")
        lines.append(seg.text.strip())
        lines.append("")
    return "\n".join(lines)


def _segments_to_json(segments, info) -> str:
    return json.dumps({
        "language": info.language,
        "language_probability": info.language_probability,
        "duration": info.duration,
        "segments": [
            {
                "id": s.id,
                "start": s.start,
                "end": s.end,
                "text": s.text.strip(),
                "avg_logprob": s.avg_logprob,
            }
            for s in segments
        ],
    }, ensure_ascii=False, indent=2)


def _output_file(output_path: str, base_name: str, fmt: str) -> Path:
    out_dir = Path(output_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return out_dir / f"{base_name}_{ts}.{fmt}"


# ── Payload ────────────────────────────────────────────────────────────────

class PipelineRunPayload(BaseModel):
    mode:        str                    # stt | tts | sts | ttt
    model_id:    str | None = None      # whisper-* or kokoro model id
    voice_id:    str | None = None      # RVC voice .pth path (sts)
    input_file:  str | None = None      # audio file path (stt / sts)
    input_text:  str | None = None      # text (tts / ttt)
    output_path: str  = r"D:\AlpHUB-Output"
    format:      str  = "wav"           # wav|flac for audio; txt|srt|json for text
    speed:         float = 1.0            # TTS/STS: Kokoro synthesis speed (0.5–2.0)
    language:      str | None = None      # STT/STS: Whisper language code (None = auto)
    system_prompt: str | None = None      # TTT: Ollama system prompt


# ── STT ────────────────────────────────────────────────────────────────────

async def _run_stt(job: Job, payload: PipelineRunPayload) -> None:
    if not payload.input_file or not Path(payload.input_file).exists():
        raise ValueError(f"Input file missing or not found: {payload.input_file}")

    await job.report_progress(5, stage="Loading model")
    size = _whisper_size(payload.model_id or "medium")

    # Start transcription — returns a lazy segment generator + TranscriptionInfo upfront
    def start_transcribe():
        model = _get_whisper(size)
        lang  = payload.language or None
        return model.transcribe(
            payload.input_file,
            beam_size=5,
            language=lang,
            task="transcribe",
        )

    await job.report_progress(10, stage="Transcribing")
    segments_gen, info = await asyncio.to_thread(start_transcribe)

    # Iterate generator segment-by-segment: each next() blocks on CTranslate2 decode
    segments: list = []
    total_est = max(1.0, info.duration / 4.5)   # ~4.5 s average per segment

    def get_next():
        """Pull one segment from the lazy generator (blocks for CTranslate2)."""
        try:
            return next(segments_gen), False
        except StopIteration:
            return None, True

    while True:
        seg, done = await asyncio.to_thread(get_next)
        if done:
            break
        segments.append(seg)
        job.check_cancel()
        pct = 10 + (len(segments) / total_est) * 79
        await job.report_progress(min(89, pct), stage="Transcribing")

    await job.report_progress(90, stage="Writing output")

    base = Path(payload.input_file).stem
    fmt  = payload.format if payload.format in ("txt", "srt", "json") else "txt"
    out  = _output_file(payload.output_path, base, fmt)

    if fmt == "txt":
        out.write_text("\n".join(s.text.strip() for s in segments), encoding="utf-8")
    elif fmt == "srt":
        out.write_text(_segments_to_srt(segments), encoding="utf-8")
    elif fmt == "json":
        out.write_text(_segments_to_json(segments, info), encoding="utf-8")

    await job.report_progress(100, stage="Done")
    job.result_path = str(out)


# ── TTS ────────────────────────────────────────────────────────────────────

async def _run_tts(job: Job, payload: PipelineRunPayload) -> None:
    if not payload.input_text or not payload.input_text.strip():
        raise ValueError("Text input is empty")

    await job.report_progress(5, stage="Loading model")
    voice  = payload.voice_id or "af_heart"
    speed  = max(0.25, min(4.0, payload.speed))
    text   = payload.input_text.strip()
    total_chars = max(1, len(text))

    # Build lazy Kokoro generator (model load happens here if cold)
    def start_synth():
        pipe = _get_kokoro("a")
        return pipe(text, voice=voice, speed=speed, split_pattern=r'\n+')

    await job.report_progress(10, stage="Synthesizing")
    gen = await asyncio.to_thread(start_synth)

    chars_done = 0
    chunks: list = []

    def get_next():
        try:
            gs, _ps, audio = next(gen)
            return (gs, audio), False
        except StopIteration:
            return None, True

    while True:
        result, done = await asyncio.to_thread(get_next)
        if done:
            break
        gs, audio = result
        chunks.append(audio)
        chars_done += len(gs)
        pct = 10 + (chars_done / total_chars) * 82
        await job.report_progress(min(92, pct), stage="Synthesizing")
        job.check_cancel()

    if not chunks:
        raise RuntimeError("Kokoro produced no audio")

    await job.report_progress(93, stage="Writing output")

    def write_audio():
        import numpy as np
        import soundfile as sf
        combined = np.concatenate(chunks)
        fmt = payload.format if payload.format in ("wav", "flac") else "wav"
        out = _output_file(payload.output_path, "tts_output", fmt)
        sf.write(str(out), combined, 24000)
        return str(out)

    out_path = await asyncio.to_thread(write_audio)
    await job.report_progress(100, stage="Done")
    job.result_path = out_path


# ── STS (speech → transcription → speech) ─────────────────────────────────

async def _run_sts(job: Job, payload: PipelineRunPayload) -> None:
    """
    Transcribe input audio with Whisper, synthesize transcript with Kokoro.
    RVC voice conversion placeholder — add rvc-python call when voices are ready.
    """
    if not payload.input_file or not Path(payload.input_file).exists():
        raise ValueError(f"Input file missing: {payload.input_file}")

    await job.report_progress(5, stage="Loading models")
    size  = _whisper_size(payload.model_id or "medium")
    voice = payload.voice_id or "af_heart"

    # Step 1: Transcribe with per-segment progress (10 → 44 %)
    def start_transcribe():
        model = _get_whisper(size)
        lang  = payload.language or None
        return model.transcribe(payload.input_file, beam_size=5,
                                language=lang, task="transcribe")

    await job.report_progress(10, stage="Transcribing")
    segments_gen, info = await asyncio.to_thread(start_transcribe)

    segments: list = []
    total_est = max(1.0, info.duration / 4.5)

    def get_next():
        try:
            return next(segments_gen), False
        except StopIteration:
            return None, True

    while True:
        seg, done = await asyncio.to_thread(get_next)
        if done:
            break
        segments.append(seg)
        job.check_cancel()
        pct = 10 + (len(segments) / total_est) * 34   # 10→44 %
        await job.report_progress(min(44, pct), stage="Transcribing")

    transcript = " ".join(s.text.strip() for s in segments)
    await job.report_progress(45, stage="Synthesizing")

    # Step 2: Synthesize with per-chunk progress (45 → 92 %)
    synth_speed = max(0.25, min(4.0, payload.speed))
    synth_total = max(1, len(transcript))

    def start_synth():
        pipe = _get_kokoro("a")
        return pipe(transcript, voice=voice, speed=synth_speed, split_pattern=r'\n+')

    synth_gen = await asyncio.to_thread(start_synth)
    synth_chars = 0
    synth_chunks: list = []

    def get_synth():
        try:
            gs, _ps, audio = next(synth_gen)
            return (gs, audio), False
        except StopIteration:
            return None, True

    while True:
        result, done = await asyncio.to_thread(get_synth)
        if done:
            break
        gs, audio = result
        synth_chunks.append(audio)
        synth_chars += len(gs)
        pct = 45 + (synth_chars / synth_total) * 47   # 45→92 %
        await job.report_progress(min(92, pct), stage="Synthesizing")
        job.check_cancel()

    if not synth_chunks:
        raise RuntimeError("Kokoro produced no audio — transcript may be empty or all silence")

    await job.report_progress(93, stage="Writing output")

    def write_sts():
        import numpy as np
        import soundfile as sf
        combined = np.concatenate(synth_chunks)
        fmt = payload.format if payload.format in ("wav", "flac") else "wav"
        out = _output_file(payload.output_path, "sts_output", fmt)
        sf.write(str(out), combined, 24000)
        return str(out)

    out_path = await asyncio.to_thread(write_sts)
    await job.report_progress(100, stage="Done")
    job.result_path = out_path


# ── TTT ────────────────────────────────────────────────────────────────────

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")


async def _run_ttt(job: Job, payload: PipelineRunPayload) -> None:
    """
    Text → Text via Ollama.
    Requires Ollama running at OLLAMA_HOST with the requested model pulled.
    model_id should be an Ollama model tag, e.g. "llama3.2:3b".
    """
    if not payload.input_text or not payload.input_text.strip():
        raise ValueError("Text input is empty")

    model = payload.model_id or "llama3.2:3b"

    await job.report_progress(5, stage="Connecting")

    try:
        import httpx
    except ImportError:
        raise RuntimeError(
            "httpx not installed. Run: pip install httpx"
        )

    await job.report_progress(10, stage="Generating")

    result_text: str = ""
    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            body: dict = {
                "model":  model,
                "prompt": payload.input_text.strip(),
                "stream": False,
            }
            if payload.system_prompt and payload.system_prompt.strip():
                body["system"] = payload.system_prompt.strip()
            r = await client.post(f"{OLLAMA_HOST}/api/generate", json=body)
            r.raise_for_status()
            result_text = r.json().get("response", "").strip()
        except httpx.ConnectError:
            raise RuntimeError(
                f"Ollama not reachable at {OLLAMA_HOST}. "
                "Start Ollama and try again."
            )
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"Ollama error {e.response.status_code}: {e.response.text}")

    await job.report_progress(90, stage="Writing output")

    if not result_text:
        raise RuntimeError("Ollama returned empty response")

    out = _output_file(payload.output_path, "ttt_output", "txt")
    out.write_text(result_text, encoding="utf-8")

    await job.report_progress(100, stage="Done")
    job.result_path = str(out)


# ── Router ─────────────────────────────────────────────────────────────────

_MODE_RUNNERS = {
    "stt": _run_stt,
    "tts": _run_tts,
    "sts": _run_sts,
    "ttt": _run_ttt,
}


@router.post("/run")
async def run_pipeline(payload: PipelineRunPayload, request: Request):
    runner = _MODE_RUNNERS.get(payload.mode)
    if not runner:
        raise HTTPException(400, f"Unknown mode: {payload.mode}")

    async def execute(job: Job):
        await runner(job, payload)

    job_id = await gpu_queue.enqueue(
        name=f"{payload.mode.upper()} — {Path(payload.input_file or 'text').name}",
        tool="pipeline",
        fn=execute,
    )
    return {"job_id": job_id}


# ── Cancel ────────────────────────────────────────────────────────────────

@router.delete("/jobs/{job_id}")
async def cancel_job(job_id: str):
    """Request cooperative cancellation of a queued or running pipeline job."""
    cancelled = gpu_queue.cancel(job_id)
    if not cancelled:
        raise HTTPException(404, f"Job {job_id} not found or already finished")
    return {"ok": True, "job_id": job_id}


# ── Voice profile creation ─────────────────────────────────────────────────

class ProfilePayload(BaseModel):
    reference_path: str
    profile_name:   str


@router.post("/profiles")
async def create_profile(payload: ProfilePayload, _request: Request):
    async def extract(job: Job):
        await job.report_progress(0)
        # TODO: rvc-python voice extraction
        await asyncio.sleep(2)
        await job.report_progress(100)
        job.result_path = str(
            Path(os.environ.get("RVC_VOICE_DIR",
                                r"D:\Ses_Modelleri\rvc\voices"))
            / payload.profile_name
        )

    job_id = await gpu_queue.enqueue(
        name=f"Extract — {payload.profile_name}",
        tool="pipeline",
        fn=extract,
    )
    return {"job_id": job_id}
