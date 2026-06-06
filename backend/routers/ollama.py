"""
Ollama router — status check + model listing.
Ollama must be running at OLLAMA_HOST (default http://localhost:11434).
"""

import os
import logging

import httpx
from fastapi import APIRouter

log    = logging.getLogger("alphub.ollama")
router = APIRouter()

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
_TIMEOUT    = 3.0   # seconds — fast timeout so UI doesn't hang


@router.get("/status")
async def ollama_status():
    """Return whether Ollama is reachable."""
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{OLLAMA_HOST}/api/tags", timeout=_TIMEOUT)
            r.raise_for_status()
        return {"running": True}
    except Exception:
        return {"running": False}


@router.get("/models")
async def ollama_models():
    """Return list of installed Ollama models."""
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{OLLAMA_HOST}/api/tags", timeout=_TIMEOUT)
            r.raise_for_status()
            data = r.json()
        models = []
        for m in data.get("models", []):
            name    = m.get("name", "")
            size_b  = m.get("size", 0)
            size_gb = round(size_b / 1e9, 1) if size_b else 0
            models.append({
                "id":      name,
                "name":    name,
                "size_gb": size_gb,
            })
        return {"models": models}
    except Exception as e:
        log.warning(f"Ollama model list failed: {e}")
        return {"models": []}
