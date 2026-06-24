"""
Stem Splitter — demucs 4.x
Supports: htdemucs_ft (4-stem fine-tuned), mdx_extra (4-stem MDX)
"""

import asyncio
import os
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from services.job_queue import gpu_queue, Job

router = APIRouter()

# Set demucs checkpoint cache from env before any demucs import
os.environ.setdefault("TORCH_HOME", os.environ.get(
    "TORCH_HOME",
    r"D:\Ses_Modelleri\demucs",
))


class SplitterRunPayload(BaseModel):
    input_path:    str
    model_id:      str                  # htdemucs_ft | mdx_extra
    stems:         list[str]            # ["vocals", "drums", ...]
    output_folder: str
    format:        str = "wav"          # wav | flac | mp3


@router.post("/run")
async def run_splitter(payload: SplitterRunPayload, request: Request):
    if not Path(payload.input_path).exists():
        raise HTTPException(400, f"Input file not found: {payload.input_path}")

    Path(payload.output_folder).mkdir(parents=True, exist_ok=True)

    async def execute(job: Job):
        await job.report_progress(3, stage="Loading model")

        # ── 1. Load model ─────────────────────────────────────────────────
        def load_model():
            from demucs.pretrained import get_model
            import torch
            model = get_model(payload.model_id)
            model.eval()
            if torch.cuda.is_available():
                model = model.cuda()
            return model

        model = await asyncio.to_thread(load_model)
        job.check_cancel()
        await job.report_progress(15, stage="Loading audio")

        # ── 2. Load + preprocess audio ────────────────────────────────────
        def load_audio():
            import torch
            import torchaudio

            wav, sr = torchaudio.load(payload.input_path)

            # Ensure stereo
            if wav.shape[0] == 1:
                wav = wav.repeat(2, 1)
            elif wav.shape[0] > 2:
                wav = wav[:2]

            # Resample to model sample rate
            if sr != model.samplerate:
                wav = torchaudio.functional.resample(wav, sr, model.samplerate)

            # Normalize — DC remove + peak scale
            wav  = wav - wav.mean()
            peak = wav.abs().max()
            if peak > 0:
                wav = wav / peak

            if torch.cuda.is_available():
                wav = wav.cuda()

            return wav, peak

        wav, peak = await asyncio.to_thread(load_audio)
        job.check_cancel()
        await job.report_progress(28, stage="Separating")

        # ── 3. Separate ───────────────────────────────────────────────────
        def separate(wav_tensor):
            import torch
            from demucs.apply import apply_model

            with torch.no_grad():
                # [batch, stems, channels, samples]
                sources = apply_model(
                    model,
                    wav_tensor.unsqueeze(0),
                    overlap=0.25,
                    shifts=0,
                    split=True,
                    progress=False,
                )
            sources = sources.squeeze(0)   # [stems, channels, samples]
            sources = sources * peak        # re-normalize
            return sources.cpu()

        sources = await asyncio.to_thread(separate, wav)
        await job.report_progress(82, stage="Exporting stems")

        # ── 4. Export stems ───────────────────────────────────────────────
        def export_stems(sources_cpu):
            import torchaudio

            out_dir   = Path(payload.output_folder)
            in_stem   = Path(payload.input_path).stem
            out_paths = []

            for i, stem_name in enumerate(model.sources):
                if stem_name not in payload.stems:
                    continue
                fname = f"{in_stem}_{stem_name}.{payload.format}"
                out_path = out_dir / fname

                audio = sources_cpu[i]   # [channels, samples]

                if payload.format == "wav":
                    torchaudio.save(str(out_path), audio, model.samplerate,
                                    encoding="PCM_S", bits_per_sample=16)
                elif payload.format == "flac":
                    torchaudio.save(str(out_path), audio, model.samplerate,
                                    format="flac")
                elif payload.format == "mp3":
                    torchaudio.save(str(out_path), audio, model.samplerate,
                                    format="mp3")
                else:
                    torchaudio.save(str(out_path), audio, model.samplerate)

                out_paths.append(str(out_path))

            return out_paths

        out_paths = await asyncio.to_thread(export_stems, sources)
        await job.report_progress(100, stage="Done")

        # Encode all stem paths as JSON so frontend can list each file
        import json as _json
        job.result_path = _json.dumps(out_paths) if out_paths else _json.dumps([payload.output_folder])

    job_id = await gpu_queue.enqueue(
        name=f"Split — {Path(payload.input_path).name}",
        tool="splitter",
        fn=execute,
    )
    return {"job_id": job_id}


# ── Merge ──────────────────────────────────────────────────────────────────

class MergePayload(BaseModel):
    input_paths:   list[str]
    output_folder: str
    output_name:   str = "merged"
    format:        str = "wav"


@router.post("/merge")
async def merge_stems(payload: MergePayload):
    if len(payload.input_paths) < 2:
        raise HTTPException(400, "Need at least 2 files to merge")
    for p in payload.input_paths:
        if not Path(p).exists():
            raise HTTPException(400, f"File not found: {p}")

    def do_merge():
        import torch
        import torchaudio

        waves: list = []
        target_sr: int | None = None

        for path in payload.input_paths:
            wav, sr = torchaudio.load(path)
            if target_sr is None:
                target_sr = sr
            elif sr != target_sr:
                wav = torchaudio.functional.resample(wav, sr, target_sr)
            if wav.shape[0] == 1:
                wav = wav.repeat(2, 1)
            elif wav.shape[0] > 2:
                wav = wav[:2]
            waves.append(wav)

        max_len = max(w.shape[1] for w in waves)
        mixed   = torch.zeros(2, max_len)
        for w in waves:
            if w.shape[1] < max_len:
                w = torch.nn.functional.pad(w, (0, max_len - w.shape[1]))
            mixed = mixed + w
        mixed = torch.clamp(mixed, -1.0, 1.0)

        out_dir = Path(payload.output_folder)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{payload.output_name}.{payload.format}"

        if payload.format == "wav":
            torchaudio.save(str(out_path), mixed, target_sr,
                            encoding="PCM_S", bits_per_sample=16)
        elif payload.format == "flac":
            torchaudio.save(str(out_path), mixed, target_sr, format="flac")
        elif payload.format == "mp3":
            torchaudio.save(str(out_path), mixed, target_sr, format="mp3")
        else:
            torchaudio.save(str(out_path), mixed, target_sr)

        return str(out_path)

    out_path = await asyncio.to_thread(do_merge)
    return {"path": out_path, "filename": Path(out_path).name}


# ── Cancel ─────────────────────────────────────────────────────────────────

@router.delete("/jobs/{job_id}")
async def cancel_split(job_id: str):
    """Request cooperative cancellation of a queued or running splitter job."""
    cancelled = gpu_queue.cancel(job_id)
    if not cancelled:
        raise HTTPException(404, f"Job {job_id} not found or already finished")
    return {"ok": True, "job_id": job_id}
