"""ImageGen router — check if local AI image generation apps are running."""
import asyncio
import socket
import subprocess
from fastapi import APIRouter, HTTPException

router = APIRouter()

APPS = [
    {
        "id":          "fooocus",
        "name":        "Fooocus",
        "port":        7865,
        "type":        "local",
        "launch_path": r"D:\Fooocus\Fooocus_win64_2-5-0\Fooocus_win64_2-5-0\run.bat",
        "url":         None,
    },
    {
        "id":          "comfyui",
        "name":        "ComfyUI",
        "port":        8188,
        "type":        "local",
        "launch_path": r"C:\Users\alper\PROJELER\ComfyUI\baslat.bat",
        "url":         None,
    },
    {
        "id":          "forge",
        "name":        "Forge",
        "port":        7860,
        "type":        "local",
        "launch_path": r"D:\Pinokio\api\Forge\app\webui.bat",
        "url":         None,
    },
    {
        "id":          "ideogram",
        "name":        "Ideogram",
        "port":        None,
        "type":        "web",
        "launch_path": None,
        "url":         "https://ideogram.ai",
    },
]


def _port_open(port: int, timeout: float = 0.6) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


@router.get("/status")
async def get_status():
    results = []
    for app in APPS:
        if app["type"] == "web":
            results.append({**app, "online": True})
        else:
            online = await asyncio.to_thread(_port_open, app["port"])
            results.append({**app, "online": online})
    return {"apps": results}


@router.post("/open")
async def open_in_browser(port: int):
    """Open a local app URL in the default browser."""
    import webbrowser
    webbrowser.open(f"http://127.0.0.1:{port}")
    return {"ok": True}


@router.post("/launch/{app_id}")
async def launch_app(app_id: str):
    """Start a local image gen app by running its launch bat file."""
    app = next((a for a in APPS if a["id"] == app_id), None)
    if not app:
        raise HTTPException(404, f"App '{app_id}' not found")
    if app["type"] == "web":
        raise HTTPException(400, "Web apps cannot be launched locally")
    launch_path = app.get("launch_path")
    if not launch_path:
        raise HTTPException(400, f"No launch path configured for '{app_id}'")

    import os
    if not os.path.exists(launch_path):
        raise HTTPException(400, f"Launch script not found: {launch_path}")

    def _run():
        subprocess.Popen(
            ["cmd", "/c", "start", "", launch_path],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
            close_fds=True,
        )

    await asyncio.to_thread(_run)
    return {"ok": True, "app_id": app_id}
