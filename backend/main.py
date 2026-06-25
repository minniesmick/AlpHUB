"""
AlpHUB Backend — FastAPI + WebSocket
Venv: D:\\AI_Ortak_Venv\\hub_venv
Run: python -m uvicorn main:app --host 127.0.0.1 --port 8765 --reload
"""

from pathlib import Path
from dotenv import load_dotenv

# Load .env before any service imports that read os.environ
load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import logging

from services.job_queue import gpu_queue
from routers import models, daw, pipeline, splitter, ollama, utils, system, projects, imagegen, ideogram_local, setup

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("alphub")

app = FastAPI(title="AlpHUB", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────
app.include_router(models.router,   prefix="/api/models",   tags=["models"])
app.include_router(daw.router,      prefix="/api/daw",      tags=["daw"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])
app.include_router(splitter.router, prefix="/api/splitter", tags=["splitter"])
app.include_router(ollama.router,   prefix="/api/ollama",   tags=["ollama"])
app.include_router(utils.router,    prefix="/api",          tags=["utils"])
app.include_router(system.router,   prefix="/api/system",   tags=["system"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(imagegen.router,       prefix="/api/imagegen",  tags=["imagegen"])
app.include_router(ideogram_local.router, prefix="/api/ideogram",  tags=["ideogram"])
app.include_router(setup.router,         prefix="/api/setup",     tags=["setup"])


# ── WebSocket connection manager ───────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        log.info(f"WS connected — {len(self.active)} clients")

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        log.info(f"WS disconnected — {len(self.active)} clients")

    async def broadcast(self, event: str, data: dict):
        msg  = json.dumps({"type": event, "data": data})
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()
app.state.manager = manager


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ── Startup ────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    # Wire manager into queue BEFORE starting worker
    gpu_queue.set_manager(manager)
    gpu_queue.start()
    asyncio.create_task(_startup_scan())


async def _startup_scan():
    await asyncio.sleep(0.5)   # let WS clients connect first
    from services.model_scanner import scan_all_models
    result = await scan_all_models(manager)
    log.info(f"Startup scan: {sum(len(v) for v in result.values())} models found")


# ── Health ─────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "clients": len(manager.active)}


# ── System info ─────────────────────────────────────────────────────────────
@app.get("/api/system")
async def system_info():
    import sys
    info: dict = {
        "python_version":   sys.version.split()[0],
        "cuda_available":   False,
        "cuda_device_name": None,
        "cuda_device_count": 0,
        "vram_total_gb":    None,
        "vram_free_gb":     None,
    }
    try:
        import torch
        info["cuda_available"]    = torch.cuda.is_available()
        if info["cuda_available"]:
            info["cuda_device_name"]  = torch.cuda.get_device_name(0)
            info["cuda_device_count"] = torch.cuda.device_count()
            props = torch.cuda.get_device_properties(0)
            info["vram_total_gb"] = round(props.total_memory / 1e9, 1)
            free, _ = torch.cuda.mem_get_info(0)
            info["vram_free_gb"]  = round(free / 1e9, 1)
    except Exception:
        pass
    return info
