"""
DAW router — ASIO stream control + device listing.
Stream: sounddevice ASIO
Graph:  pedalboard chain built from node graph
"""

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

log = logging.getLogger("alphub.daw")
router = APIRouter()

# ── Module-level state ─────────────────────────────────────────────────────
_stream:        Any  = None
_stream_active: bool = False
_current_graph: dict = {}
_input_idx:     int  = -1
_output_idx:    int  = -1
_sample_rate:   int  = 44100
_blocksize:     int  = 256

# Mutable chain holder — callback reads this each call (fixes stale closure)
_chain_state:   dict = {"chain": None}

# node_id → pedalboard plugin instance for live param updates
_plugin_map:    dict = {}

# Latest FFT magnitudes written by stream thread, read by broadcast task
_latest_fft:    list | None = None

_ws_manager:    Any  = None
_spectrum_task: asyncio.Task | None = None


# ── Devices ────────────────────────────────────────────────────────────────

@router.get("/devices")
async def list_devices():
    """Return available audio input/output devices via sounddevice."""
    def query():
        import sounddevice as sd
        devices  = sd.query_devices()
        in_devs  = []
        out_devs = []
        for i, d in enumerate(devices):
            entry = {"index": i, "name": d["name"]}
            if d["max_input_channels"] > 0:
                in_devs.append(entry)
            if d["max_output_channels"] > 0:
                out_devs.append(entry)
        return {"input": in_devs, "output": out_devs}

    try:
        return await asyncio.to_thread(query)
    except Exception as exc:
        log.warning(f"sounddevice query failed: {exc}")
        return {"input": [], "output": [], "error": str(exc)}


# ── Graph ──────────────────────────────────────────────────────────────────

class GraphPayload(BaseModel):
    nodes: list[dict]
    edges: list[dict]


@router.post("/graph")
async def set_graph(payload: GraphPayload, request: Request):
    global _current_graph
    _current_graph = payload.model_dump()
    manager = request.app.state.manager

    if _stream_active:
        # Rebuild chain in worker thread; callback reads _chain_state on next call
        await asyncio.to_thread(_rebuild_chain, payload.nodes)

    await manager.broadcast("graph_updated", {"node_count": len(payload.nodes)})
    return {"ok": True, "node_count": len(payload.nodes)}


# ── Stream start / stop ────────────────────────────────────────────────────

class StreamConfig(BaseModel):
    input_idx:   int = -1
    output_idx:  int = -1
    sample_rate: int = 44100
    blocksize:   int = 256


@router.post("/start")
async def start_stream(cfg: StreamConfig | None = None, request: Request = None):
    global _stream, _stream_active, _input_idx, _output_idx, _sample_rate, _blocksize
    global _ws_manager, _spectrum_task, _latest_fft

    if _stream_active:
        return {"ok": True, "already_running": True}

    if cfg:
        _input_idx   = cfg.input_idx
        _output_idx  = cfg.output_idx
        _sample_rate = cfg.sample_rate
        _blocksize   = cfg.blocksize

    def open_stream():
        import sounddevice as sd
        import numpy as np

        # Build initial chain
        _chain_state["chain"] = _build_chain(_current_graph.get("nodes", []))

        def callback(indata, outdata, frames, time_info, status):
            global _latest_fft
            if status:
                log.warning(f"stream status: {status}")

            chain = _chain_state["chain"]   # always reads current chain, not stale closure
            if chain:
                mono = indata.mean(axis=1, keepdims=True)
                processed = chain(mono.T.astype("float32"), _sample_rate)
                outdata[:] = np.tile(processed.T, (1, outdata.shape[1]))[:frames]
            else:
                outdata[:] = indata

            # Compute 128-bin FFT for spectrum display (non-blocking, GIL-safe)
            out_mono = outdata[:, 0]
            fft_mag  = np.abs(np.fft.rfft(out_mono, n=512))[:128]
            peak     = fft_mag.max()
            if peak > 0:
                fft_mag = fft_mag / peak
            _latest_fft = fft_mag.tolist()

        stream = sd.Stream(
            samplerate=_sample_rate,
            blocksize=_blocksize,
            device=(
                _input_idx  if _input_idx  >= 0 else None,
                _output_idx if _output_idx >= 0 else None,
            ),
            channels=(2, 2),
            dtype="float32",
            callback=callback,
        )
        stream.start()
        return stream

    try:
        _stream = await asyncio.to_thread(open_stream)
        _stream_active = True

        manager = request.app.state.manager if request else None
        _ws_manager = manager
        if manager:
            await manager.broadcast("stream_status", {"active": True})
            _spectrum_task = asyncio.create_task(_spectrum_broadcast_loop())

        log.info(f"ASIO stream started — {_sample_rate}Hz / {_blocksize} smp")
        return {"ok": True}

    except Exception as exc:
        log.error(f"Stream start failed: {exc}")
        raise HTTPException(500, str(exc))


@router.post("/stop")
async def stop_stream(request: Request = None):
    global _stream, _stream_active, _spectrum_task, _latest_fft

    if _stream is not None:
        def close():
            _stream.stop()
            _stream.close()
        await asyncio.to_thread(close)
        _stream = None

    _stream_active = False
    _latest_fft = None

    if _spectrum_task and not _spectrum_task.done():
        _spectrum_task.cancel()
    _spectrum_task = None

    manager = request.app.state.manager if request else None
    if manager:
        await manager.broadcast("stream_status", {"active": False})

    log.info("ASIO stream stopped")
    return {"ok": True}


# ── Spectrum broadcast task ─────────────────────────────────────────────────

async def _spectrum_broadcast_loop():
    """Broadcast FFT data via WebSocket at ~10 fps while stream is running."""
    while _stream_active:
        fft = _latest_fft
        if fft and _ws_manager:
            await _ws_manager.broadcast("spectrum_data", {
                "node_id": "asio-out",   # frontend accepts this for any selected node
                "fft": fft,
            })
        await asyncio.sleep(0.1)


# ── Live parameter update ──────────────────────────────────────────────────

@router.put("/param")
async def set_param(node_id: str, param: str, value: float):
    plugin = _plugin_map.get(node_id)
    if plugin is None:
        log.debug(f"param: {node_id}.{param} = {value} (node not in chain)")
        return {"ok": True}

    await asyncio.to_thread(_apply_param, plugin, param, value)
    log.debug(f"param: {node_id}.{param} = {value}")
    return {"ok": True}


def _apply_param(plugin: Any, param_label: str, value: float) -> None:
    """
    Map knob label → pedalboard attribute and set it.
    Value arrives in real units (dB, ratio, ms, seconds, 0-1) — no scaling needed.
    Frontend sends real-unit values via [min, max] ParameterKnob.

    plugin may be a tuple (low, mid, high) for multi-band EQ nodes.
    """
    try:
        import pedalboard as pb
        key = param_label.lower()

        # ── Multi-band EQ tuple ────────────────────────────────────────────
        if isinstance(plugin, tuple):
            low_p, mid_p, high_p = plugin
            if "low" in key:
                setattr(low_p, "gain_db", value)
            elif "high" in key:
                setattr(high_p, "gain_db", value)
            elif "mid" in key:
                setattr(mid_p, "gain_db", value)
            return

        # ── Single-plugin mapping ──────────────────────────────────────────
        norm_key = key.replace(" ", "_")
        if isinstance(plugin, pb.Reverb):
            mapping = {
                "room_size": "room_size",   # 0–1
                "damping":   "damping",     # 0–1
                "wet":       "wet_level",   # 0–1
                "dry":       "dry_level",   # 0–1
            }
        elif isinstance(plugin, pb.Compressor):
            mapping = {
                "threshold": "threshold_db",
                "ratio":     "ratio",
                "attack":    "attack_ms",
                "release":   "release_ms",
            }
        elif isinstance(plugin, pb.Delay):
            mapping = {
                "time":     "delay_seconds",
                "feedback": "feedback",
                "mix":      "mix",
            }
        elif isinstance(plugin, pb.Gain):
            mapping = {
                "gain": "gain_db",
                "db":   "gain_db",
            }
        else:
            mapping = {}
        attr = mapping.get(norm_key)
        if attr:
            setattr(plugin, attr, value)
    except Exception as exc:
        log.debug(f"_apply_param failed: {exc}")


# ── Pedalboard chain builder ───────────────────────────────────────────────

def _build_chain(nodes: list[dict]):
    """
    Build pedalboard.Pedalboard from node list.
    Populates _plugin_map for live param updates.
    Returns None when pedalboard absent or no active effect nodes.
    """
    global _plugin_map
    try:
        import pedalboard as pb
    except ImportError:
        return None

    plugins  = []
    new_map  = {}

    for node in nodes:
        node_id  = node.get("id", "")
        data     = node.get("data", {})
        if data.get("bypassed", False):
            continue
        label  = data.get("label", "").lower()
        params = {p["label"].lower(): p.get("value", 0) for p in data.get("params") or []}

        def _f(key: str, default: float) -> float:
            """Safe float from param dict — handles string values like '-12 dB'."""
            try:
                return float(params.get(key, default))
            except (TypeError, ValueError):
                return default

        plugin: Any = None
        if "equalizer" in label:
            # 3-band EQ: LowShelf → PeakFilter → HighShelf
            low_p  = pb.LowShelfFilter(
                cutoff_frequency_hz = 300.0,
                gain_db = _f("low shelf", 0.0),
                q = 0.707,
            )
            mid_p  = pb.PeakFilter(
                cutoff_frequency_hz = 1000.0,
                gain_db = _f("mid", 0.0),
                q = 0.707,
            )
            high_p = pb.HighShelfFilter(
                cutoff_frequency_hz = 8000.0,
                gain_db = _f("high shelf", 0.0),
                q = 0.707,
            )
            plugins.extend([low_p, mid_p, high_p])
            new_map[node_id] = (low_p, mid_p, high_p)
            continue  # already appended — skip single-plugin path

        elif "reverb" in label:
            plugin = pb.Reverb(
                room_size = _f("room size", 0.5),
                wet_level = _f("wet",       0.3),
            )
        elif "compressor" in label:
            plugin = pb.Compressor(
                threshold_db = _f("threshold", -18.0),
                ratio        = _f("ratio",     4.0),
                attack_ms    = _f("attack",    5.0),
                release_ms   = _f("release",   100.0),
            )
        elif "delay" in label:
            plugin = pb.Delay(
                delay_seconds = _f("time",     0.25),
                feedback      = _f("feedback", 0.3),
                mix           = _f("mix",      0.3),
            )
        elif "gain" in label:
            plugin = pb.Gain(gain_db=_f("db", _f("gain", 0.0)))

        if plugin is not None:
            plugins.append(plugin)
            new_map[node_id] = plugin

    _plugin_map = new_map
    return pb.Pedalboard(plugins) if plugins else None


def _rebuild_chain(nodes: list[dict]) -> None:
    """Swap the running chain. Callback reads _chain_state on next buffer."""
    _chain_state["chain"] = _build_chain(nodes)
