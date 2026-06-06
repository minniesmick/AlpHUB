import asyncio
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from services.model_scanner import scan_all_models, scan_models_sync, scan_profiles_sync, PROFILE_DIR

router = APIRouter()


class RescanPayload(BaseModel):
    model_root: str | None = None


@router.get("")
async def list_models(model_root: str | None = None):
    result = await asyncio.to_thread(scan_models_sync, model_root or None)
    return {"models": result}               # frontend expects r.models


@router.post("/rescan")
async def rescan_models(request: Request, payload: RescanPayload = RescanPayload()):
    manager = request.app.state.manager
    result  = await scan_all_models(manager, model_root=payload.model_root)
    return {"models": result}


@router.get("/profiles")
async def list_profiles():
    return scan_profiles_sync()


@router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str):
    """Delete a voice profile directory by id (directory name)."""
    # Sanitize: profile_id must be a simple name, no path traversal
    if "/" in profile_id or "\\" in profile_id or ".." in profile_id:
        raise HTTPException(400, "Invalid profile id")
    profile_path = PROFILE_DIR / profile_id
    if not profile_path.exists() or not profile_path.is_dir():
        raise HTTPException(404, f"Profile '{profile_id}' not found")
    shutil.rmtree(profile_path)
    return {"ok": True, "deleted": profile_id}
