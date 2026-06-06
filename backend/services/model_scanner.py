"""
Model directory scanner.
Reads paths from backend/.env via python-dotenv.
faster-whisper: looks for HF Hub cache dirs (models--Systran--faster-whisper-*)
demucs: .th checkpoint files
rvc: .pth voice files
kokoro: model subdirectories containing model.bin / kokoro*.pth
"""

import os
import asyncio
import json
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Load .env from backend/ dir (one level up from services/)
_ENV_PATH = Path(__file__).parent.parent / ".env"
load_dotenv(_ENV_PATH)

# ── Paths from .env ────────────────────────────────────────────────────────
_ROOT = Path(os.environ.get("MODEL_ROOT", r"D:\Ses_Modelleri"))

MODEL_DIRS: dict[str, Path] = {
    "whisper": Path(os.environ.get("WHISPER_MODEL_DIR", _ROOT / "whisper")),
    "demucs":  Path(os.environ.get("DEMUCS_MODEL_DIR",  _ROOT / "demucs")),
    "rvc":     Path(os.environ.get("RVC_VOICE_DIR",      _ROOT / "rvc" / "voices")),
    "kokoro":  Path(os.environ.get("KOKORO_MODEL_DIR",   _ROOT / "kokoro")),
}

PROFILE_DIR = Path(os.environ.get("RVC_PROFILE_DIR", _ROOT / "rvc" / "profiles"))


# ── Scanners ───────────────────────────────────────────────────────────────

def _scan_whisper(directory: Path) -> list[dict[str, str]]:
    """
    faster-whisper stores models in HF hub cache format:
      {directory}/models--Systran--faster-whisper-{size}/snapshots/{hash}/model.bin
    Also accepts flat named dirs:  {directory}/{size}/model.bin
    """
    if not directory.exists():
        return []

    models = []

    # HF hub cache format
    for p in sorted(directory.iterdir()):
        if p.is_dir() and p.name.startswith("models--Systran--faster-whisper-"):
            size_name = p.name.replace("models--Systran--faster-whisper-", "")
            snapshots = p / "snapshots"
            if snapshots.exists():
                for snap in snapshots.iterdir():
                    if (snap / "model.bin").exists():
                        models.append({
                            "id":   f"whisper-{size_name}",
                            "name": f"Whisper {size_name.replace('-', ' ').title()}",
                            "path": str(snap),
                            "tool": "whisper",
                            "size": size_name,
                        })
                        break  # only one snapshot per size

    # Flat format: {directory}/{size}/model.bin
    for p in sorted(directory.iterdir()):
        if p.is_dir() and not p.name.startswith("models--") and (p / "model.bin").exists():
            models.append({
                "id":   f"whisper-{p.name}",
                "name": f"Whisper {p.name.replace('-', ' ').title()}",
                "path": str(p),
                "tool": "whisper",
                "size": p.name,
            })

    return models


def _scan_demucs(directory: Path) -> list[dict[str, str]]:
    """
    demucs checkpoints: .th files, or HF cache under checkpoints/.
    TORCH_HOME/hub/checkpoints/ is where torch.hub downloads.
    """
    if not directory.exists():
        return []

    known = {
        "htdemucs_ft":  "HTDemucs FT (fine-tuned, best quality)",
        "htdemucs_6s":  "HTDemucs 6-stem (vocals/drums/bass/other/piano/guitar)",
        "htdemucs":     "HTDemucs (standard)",
        "mdx_extra":    "MDX Extra (fast, strong separation)",
        "mdx_extra_q":  "MDX Extra Q (quantized)",
        "mdx":          "MDX (balanced)",
    }

    found = []

    # Search for .th files in directory tree
    for th in sorted(directory.rglob("*.th")):
        stem = th.stem.split("-")[0]  # strip hash suffix if present
        label = known.get(stem, stem.replace("_", " ").title())
        found.append({
            "id":   stem,
            "name": label,
            "path": str(th),
            "tool": "demucs",
        })

    return found


def _scan_rvc(directory: Path) -> list[dict[str, str]]:
    """RVC voices: .pth files in the voices directory."""
    if not directory.exists():
        return []

    models = []
    for f in sorted(directory.glob("*.pth")):
        models.append({
            "id":   f.stem,
            "name": f.stem.replace("-", " ").replace("_", " ").title(),
            "path": str(f),
            "tool": "rvc",
            "index": str(f.with_suffix(".index")) if f.with_suffix(".index").exists() else "",
        })
    return models


def _scan_kokoro(directory: Path) -> list[dict[str, str]]:
    """
    Kokoro: HF snapshot dirs or local model dirs containing config.json.
    """
    if not directory.exists():
        return []

    models = []

    # HF hub cache format
    for p in sorted(directory.iterdir()):
        if p.is_dir() and p.name.startswith("models--"):
            display = p.name.replace("models--", "").replace("--", "/")
            snapshots = p / "snapshots"
            if snapshots.exists():
                for snap in snapshots.iterdir():
                    if (snap / "config.json").exists():
                        models.append({
                            "id":   p.name,
                            "name": display,
                            "path": str(snap),
                            "tool": "kokoro",
                        })
                        break

    # Flat format: named dir with config.json
    for p in sorted(directory.iterdir()):
        if p.is_dir() and not p.name.startswith("models--") and (p / "config.json").exists():
            models.append({
                "id":   p.name,
                "name": p.name.replace("-", " ").replace("_", " ").title(),
                "path": str(p),
                "tool": "kokoro",
            })

    return models


# ── Public API ─────────────────────────────────────────────────────────────

_SCANNERS = {
    "whisper": _scan_whisper,
    "demucs":  _scan_demucs,
    "rvc":     _scan_rvc,
    "kokoro":  _scan_kokoro,
}


def _resolve_dirs(model_root: str | None) -> dict[str, Path]:
    """
    Build tool→path mapping.
    If model_root is given (from UI), derive subdirs from it directly.
    Otherwise fall back to module-level MODEL_DIRS (env-var overridable).
    """
    if model_root:
        root = Path(model_root)
        return {
            "whisper": root / "whisper",
            "demucs":  root / "demucs",
            "rvc":     root / "rvc" / "voices",
            "kokoro":  root / "kokoro",
        }
    return MODEL_DIRS


def scan_models_sync(model_root: str | None = None) -> dict[str, list[dict[str, Any]]]:
    dirs = _resolve_dirs(model_root)
    return {tool: _SCANNERS[tool](path) for tool, path in dirs.items()}


def scan_profiles_sync() -> list[dict[str, str]]:
    if not PROFILE_DIR.exists():
        return []
    profiles = []
    for d in sorted(PROFILE_DIR.iterdir()):
        meta_path = d / "meta.json"
        if d.is_dir() and meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text())
                profiles.append({"id": d.name, **meta})
            except Exception:
                pass
    return profiles


async def scan_all_models(manager=None, model_root: str | None = None) -> dict[str, list[dict]]:
    dirs = list(_resolve_dirs(model_root).items())
    result: dict[str, list[dict]] = {}

    for i, (tool, path) in enumerate(dirs):
        models = await asyncio.to_thread(_SCANNERS[tool], path)
        result[tool] = models

        if manager:
            await manager.broadcast("scan_progress", {
                "scanned":     i + 1,
                "total":       len(dirs),
                "current_dir": str(path),
            })

    if manager:
        await manager.broadcast("scan_complete", {"models": result})

    return result
