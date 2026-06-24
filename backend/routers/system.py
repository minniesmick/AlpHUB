"""System metrics router — CPU / RAM / GPU via psutil + pynvml."""
import asyncio
import logging
from fastapi import APIRouter

router = APIRouter()
log    = logging.getLogger("alphub.system")


def _get_metrics() -> dict:
    import psutil

    cpu  = psutil.cpu_percent(interval=0.15)
    ram  = psutil.virtual_memory()
    net  = psutil.net_io_counters()
    disk = psutil.disk_usage("C:\\")

    m: dict = {
        "cpu_pct":        cpu,
        "ram_pct":        ram.percent,
        "ram_used_gb":    round(ram.used  / 1e9, 2),
        "ram_total_gb":   round(ram.total / 1e9, 2),
        "net_recv_mb":    round(net.bytes_recv / 1e6, 1) if net else 0,
        "net_sent_mb":    round(net.bytes_sent / 1e6, 1) if net else 0,
        "disk_pct":       disk.percent,
        "disk_used_gb":   round(disk.used  / 1e9, 1),
        "disk_total_gb":  round(disk.total / 1e9, 1),
        "gpu_pct":        None,
        "gpu_mem_used_gb":  None,
        "gpu_mem_total_gb": None,
        "gpu_temp":       None,
        "gpu_name":       None,
    }

    try:
        import pynvml  # type: ignore
        pynvml.nvmlInit()
        h    = pynvml.nvmlDeviceGetHandleByIndex(0)
        util = pynvml.nvmlDeviceGetUtilizationRates(h)
        mem  = pynvml.nvmlDeviceGetMemoryInfo(h)
        temp = pynvml.nvmlDeviceGetTemperature(h, pynvml.NVML_TEMPERATURE_GPU)
        name = pynvml.nvmlDeviceGetName(h)
        m["gpu_pct"]          = util.gpu
        m["gpu_mem_used_gb"]  = round(mem.used  / 1e9, 2)
        m["gpu_mem_total_gb"] = round(mem.total / 1e9, 2)
        m["gpu_temp"]         = temp
        m["gpu_name"]         = name.decode() if isinstance(name, bytes) else name
        pynvml.nvmlShutdown()
    except Exception as e:
        log.debug("GPU metrics: %s", e)

    return m


@router.get("/metrics")
async def get_metrics():
    return await asyncio.to_thread(_get_metrics)
