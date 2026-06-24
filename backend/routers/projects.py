"""Projects router — scan a directory for git repos."""
import asyncio
import os
import subprocess
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()

_EXT_LANG: dict[str, str] = {
    ".py": "Python", ".ts": "TypeScript", ".tsx": "TypeScript",
    ".js": "JavaScript", ".jsx": "JavaScript", ".rs": "Rust",
    ".go": "Go", ".java": "Java", ".cs": "C#", ".cpp": "C++",
    ".c": "C", ".kt": "Kotlin", ".swift": "Swift", ".rb": "Ruby",
    ".vue": "Vue", ".svelte": "Svelte",
}

_SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv",
              "dist", "out", "build", ".next", ".nuxt", "target"}


def _detect_lang(path: Path) -> str:
    counts: dict[str, int] = {}
    try:
        for root_dir, dirs, files in os.walk(str(path)):
            dirs[:] = [d for d in dirs if d not in _SKIP_DIRS]
            for fname in files:
                ext = os.path.splitext(fname)[1].lower()
                if ext in _EXT_LANG:
                    counts[ext] = counts.get(ext, 0) + 1
    except Exception:
        pass
    if not counts:
        return "Unknown"
    top = max(counts, key=lambda e: counts[e])
    return _EXT_LANG[top]


def _git(cmd: list[str], cwd: str, timeout: int = 3) -> str:
    try:
        r = subprocess.run(["git", "-C", cwd] + cmd,
                           capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def _scan(root_path: str) -> list[dict]:
    root = Path(root_path)
    if not root.exists():
        return []

    out: list[dict] = []
    for entry in root.iterdir():
        if not entry.is_dir() or not (entry / ".git").exists():
            continue
        cwd   = str(entry)
        log   = _git(["log", "-1", "--format=%H|%s|%ai"], cwd)
        parts = log.split("|", 2) if log else []
        last_commit = (
            {"hash": parts[0][:7], "msg": parts[1], "date": parts[2]}
            if len(parts) == 3 else None
        )
        branch = _git(["branch", "--show-current"], cwd) or "main"
        lang   = _detect_lang(entry)
        stat   = entry.stat()
        out.append({
            "name":        entry.name,
            "path":        cwd,
            "branch":      branch,
            "lang":        lang,
            "last_commit": last_commit,
            "modified_at": stat.st_mtime,
        })

    out.sort(key=lambda p: p["modified_at"], reverse=True)
    return out


@router.get("")
async def list_projects(root: str = "C:/Users/alper/PROJELER"):
    return {"projects": await asyncio.to_thread(_scan, root)}
