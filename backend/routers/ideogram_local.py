"""
Ideogram 4 local inference — NF4 quantized model.
Model: D:\AI_Ortak_Modeller\ideogram4-nf4
Requires: diffusers (dev), bitsandbytes, accelerate
"""

import asyncio
import os
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.job_queue import gpu_queue, Job

router = APIRouter()

MODEL_PATH   = os.environ.get("IDEOGRAM_MODEL_PATH", r"D:\AI_Ortak_Modeller\ideogram4-nf4")
OUTPUT_ROOT  = os.environ.get("DEFAULT_OUTPUT_DIR", r"D:\AlpHUB-Output")
OUTPUT_DIR   = Path(OUTPUT_ROOT) / "ideogram"

# Lazy-loaded pipeline singleton
_pipe = None


def _load_pipe():
    global _pipe
    if _pipe is not None:
        return _pipe

    import torch
    from diffusers import Ideogram4Pipeline

    _pipe = Ideogram4Pipeline.from_pretrained(
        MODEL_PATH,
        torch_dtype=torch.bfloat16,
        local_files_only=True,
    )
    _pipe.to("cuda" if torch.cuda.is_available() else "cpu")
    return _pipe


class GeneratePayload(BaseModel):
    prompt:     str
    width:      int  = 1024
    height:     int  = 1024
    steps:      int  = 28
    guidance:   float = 3.5
    seed:       int  = -1         # -1 = random


@router.post("/generate")
async def generate(payload: GeneratePayload):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    async def execute(job: Job):
        await job.report_progress(5, stage="Loading model")

        def load_and_run():
            import torch

            pipe = _load_pipe()
            job_check = job.check_cancel  # keep ref for thread

            job_check()

            seed  = payload.seed if payload.seed >= 0 else int(time.time() * 1000) % (2**31)
            gen   = torch.Generator("cuda").manual_seed(seed)

            # Clamp to multiples of 64 within supported range
            w = max(512, min(2048, (payload.width  // 64) * 64))
            h = max(512, min(2048, (payload.height // 64) * 64))

            def _progress_cb(pipe_self, i, t, kwargs):
                total = payload.steps
                pct   = int(5 + (i / total) * 88)
                # Fire-and-forget — we're in a thread, can't await
                asyncio.run_coroutine_threadsafe(
                    job.report_progress(pct, stage=f"Step {i}/{total}"),
                    asyncio.get_event_loop(),
                )
                return kwargs

            with torch.no_grad():
                image = pipe(
                    payload.prompt,
                    width=w,
                    height=h,
                    num_inference_steps=payload.steps,
                    guidance_scale=payload.guidance,
                    generator=gen,
                    callback_on_step_end=_progress_cb,
                ).images[0]

            ts       = int(time.time())
            out_path = OUTPUT_DIR / f"ideogram_{ts}_{seed}.png"
            image.save(str(out_path))
            return str(out_path), seed

        out_path, seed = await asyncio.to_thread(load_and_run)
        await job.report_progress(100, stage="Done")
        job.result_path = out_path

    job_id = await gpu_queue.enqueue(
        name=f"Ideogram — {payload.prompt[:40]}…",
        tool="ideogram",
        fn=execute,
    )
    return {"job_id": job_id}


@router.delete("/jobs/{job_id}")
async def cancel_generate(job_id: str):
    cancelled = gpu_queue.cancel(job_id)
    if not cancelled:
        raise HTTPException(404, f"Job {job_id} not found or already finished")
    return {"ok": True, "job_id": job_id}


@router.get("/outputs")
async def list_outputs(limit: int = 40):
    """Return recent generated images, newest first."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(OUTPUT_DIR.glob("*.png"), key=lambda p: p.stat().st_mtime, reverse=True)
    return {
        "outputs": [
            {"path": str(f), "filename": f.name, "mtime": int(f.stat().st_mtime)}
            for f in files[:limit]
        ]
    }
