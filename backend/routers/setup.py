"""
First-run model prefetch.
Downloads demucs + whisper + kokoro on startup if not already cached.
"""

import asyncio
import logging
import os
from pathlib import Path

from fastapi import APIRouter, Request

log = logging.getLogger("alphub.setup")
router = APIRouter()

# ── Where models live ──────────────────────────────────────────────────────

DEMUCS_MODELS = ["htdemucs_ft"]          # default splitter model

WHISPER_SIZE   = "medium"                # default STT model
WHISPER_DIR    = os.environ.get("WHISPER_MODEL_DIR", r"D:\Ses_Modelleri\whisper")

TORCH_HOME     = os.environ.get("TORCH_HOME", r"D:\Ses_Modelleri\demucs")


# ── Presence checks ────────────────────────────────────────────────────────

def _demucs_cached(model_id: str) -> bool:
    checkpoint_dir = Path(TORCH_HOME) / "hub" / "checkpoints"
    if not checkpoint_dir.exists():
        return False
    return any(p.stem.startswith(model_id) for p in checkpoint_dir.glob("*.th"))


def _whisper_cached(size: str) -> bool:
    model_dir = Path(WHISPER_DIR)
    if not model_dir.exists():
        return False
    # faster-whisper stores models as subdirectories named after the model
    return any((model_dir / d).is_dir() and size in d for d in os.listdir(model_dir))


def _kokoro_cached() -> bool:
    # kokoro stores weights in HuggingFace cache; treat as optional
    try:
        from kokoro import KPipeline  # noqa: F401 — just import-check
        hf_cache = Path.home() / ".cache" / "huggingface" / "hub"
        return any("hexgrad" in str(p) or "kokoro" in str(p).lower()
                   for p in hf_cache.glob("models--*")) if hf_cache.exists() else False
    except ImportError:
        return False


# ── Routes ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def setup_status():
    demucs_ok  = {m: _demucs_cached(m) for m in DEMUCS_MODELS}
    whisper_ok = _whisper_cached(WHISPER_SIZE)
    kokoro_ok  = _kokoro_cached()
    all_ready  = all(demucs_ok.values()) and whisper_ok and kokoro_ok
    return {
        "demucs":    demucs_ok,
        "whisper":   whisper_ok,
        "kokoro":    kokoro_ok,
        "all_ready": all_ready,
    }


@router.post("/prefetch")
async def prefetch_models(request: Request):
    """
    Starts background download of all missing models.
    Progress reported via WS: setup_progress + setup_complete events.
    Returns immediately — download runs as asyncio task.
    """
    mgr = request.app.state.manager

    async def _run():
        async def progress(stage: str, pct: int, msg: str):
            await mgr.broadcast("setup_progress", {"stage": stage, "pct": pct, "msg": msg})
            log.info(f"[setup] {stage} {pct}% — {msg}")

        try:
            # ── 1. Demucs ─────────────────────────────────────────────────
            for model_id in DEMUCS_MODELS:
                if _demucs_cached(model_id):
                    await progress("demucs", 25, f"{model_id} already cached")
                    continue
                await progress("demucs", 0, f"Downloading {model_id}…")

                def _dl_demucs():
                    from demucs.pretrained import get_model
                    model = get_model(model_id)
                    model.eval()

                await asyncio.to_thread(_dl_demucs)
                await progress("demucs", 25, f"{model_id} ready")

            # ── 2. Whisper ────────────────────────────────────────────────
            if _whisper_cached(WHISPER_SIZE):
                await progress("whisper", 65, f"whisper-{WHISPER_SIZE} already cached")
            else:
                await progress("whisper", 30, f"Downloading whisper-{WHISPER_SIZE}…")

                def _dl_whisper():
                    import torch
                    from faster_whisper import WhisperModel
                    device       = "cuda" if torch.cuda.is_available() else "cpu"
                    compute_type = "float16" if device == "cuda" else "int8"
                    WhisperModel(WHISPER_SIZE, device=device, compute_type=compute_type,
                                 download_root=WHISPER_DIR)

                await asyncio.to_thread(_dl_whisper)
                await progress("whisper", 65, f"whisper-{WHISPER_SIZE} ready")

            # ── 3. Kokoro ─────────────────────────────────────────────────
            if _kokoro_cached():
                await progress("kokoro", 90, "kokoro already cached")
            else:
                await progress("kokoro", 70, "Downloading kokoro weights…")

                def _dl_kokoro():
                    from kokoro import KPipeline
                    KPipeline(lang_code="a")   # downloads English weights

                await asyncio.to_thread(_dl_kokoro)
                await progress("kokoro", 90, "kokoro ready")

            await progress("done", 100, "All models ready")
            await mgr.broadcast("setup_complete", {})

        except Exception as e:
            log.exception("Setup prefetch failed")
            await mgr.broadcast("setup_error", {"error": str(e)})

    asyncio.ensure_future(_run())
    return {"ok": True}
