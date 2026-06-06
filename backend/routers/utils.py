"""
Utility routes — local file access helpers.
Only text files allowed (safety guard for local desktop use).
"""

from pathlib import Path
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

_TEXT_SUFFIXES = {".txt", ".srt", ".json", ".md", ".log"}


@router.get("/file")
async def read_file(path: str = Query(..., description="Absolute file path")):
    """Read a local text file and return its content."""
    p = Path(path)
    if p.suffix.lower() not in _TEXT_SUFFIXES:
        raise HTTPException(400, f"Only text files allowed, got: {p.suffix}")
    if not p.exists():
        raise HTTPException(404, f"File not found: {path}")
    try:
        content = p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"content": content, "filename": p.name}
