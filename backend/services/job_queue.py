"""
Serialized GPU job queue.
One GPU job runs at a time — no concurrent inference (VRAM protection).
"""

import asyncio
import logging
import time
import traceback
import uuid
from enum import Enum
from typing import Any, Callable, Awaitable
from dataclasses import dataclass, field

log = logging.getLogger("alphub.queue")


class JobStatus(str, Enum):
    QUEUED    = "queued"
    RUNNING   = "running"
    DONE      = "done"
    ERROR     = "error"
    CANCELLED = "cancelled"


class CancelledError(Exception):
    """Raised inside a job when cancel has been requested."""


@dataclass
class Job:
    job_id: str
    name: str
    tool: str
    fn: Callable[["Job"], Awaitable[Any]]
    status: JobStatus     = JobStatus.QUEUED
    progress: float       = 0.0
    eta_seconds: int | None = None
    stage: str | None     = None
    result_path: str | None = None
    error: str | None     = None
    broadcast_fn: Any     = field(default=None, repr=False)
    _cancel_requested: bool = field(default=False, repr=False)
    _start_time: float    = field(default=0.0,   repr=False)

    def request_cancel(self) -> None:
        self._cancel_requested = True

    def check_cancel(self) -> None:
        """Call at yield points inside a job fn to raise CancelledError early."""
        if self._cancel_requested:
            raise CancelledError("Job cancelled by user")

    async def report_progress(self, progress: float, eta: int | None = None, stage: str | None = None) -> None:
        """Call from inside job fn to push progress to frontend. Also checks cancel."""
        self.check_cancel()
        self.progress = float(progress)
        if stage is not None:
            self.stage = stage
        # Auto-compute ETA from elapsed time if not provided explicitly
        if eta is not None:
            self.eta_seconds = eta
        elif self._start_time > 0 and progress > 5:
            elapsed = time.monotonic() - self._start_time
            pct     = progress / 100.0
            if pct > 0.01:
                total_est        = elapsed / pct
                remaining        = max(0.0, total_est - elapsed)
                self.eta_seconds = int(remaining)
        if self.broadcast_fn:
            await self.broadcast_fn("job_progress", self)


class GpuJobQueue:
    def __init__(self):
        self._queue: asyncio.Queue[Job] = asyncio.Queue()
        self._jobs:  dict[str, Job]     = {}
        self._manager = None
        self._worker_task: asyncio.Task | None = None

    def set_manager(self, manager) -> None:
        self._manager = manager

    def start(self) -> None:
        """Start the background worker. Call once at app startup."""
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker())

    async def _worker(self) -> None:
        while True:
            job = await self._queue.get()
            # If cancelled while queued, skip it
            if job._cancel_requested:
                job.status = JobStatus.CANCELLED
                await self._broadcast("job_cancelled", job)
                self._queue.task_done()
                continue
            job.status       = JobStatus.RUNNING
            job._start_time  = time.monotonic()         # for ETA computation
            job.broadcast_fn = self._broadcast          # inject broadcast capability
            await self._broadcast("job_progress", job)  # initial 0% ping
            try:
                await job.fn(job)
                job.status = JobStatus.DONE
                await self._broadcast("job_complete", job)
            except CancelledError:
                job.status = JobStatus.CANCELLED
                log.info("Job %s (%s) cancelled", job.job_id, job.name)
                await self._broadcast("job_cancelled", job)
            except Exception as exc:
                job.status = JobStatus.ERROR
                job.error  = str(exc)
                log.error("Job %s (%s) failed: %s\n%s",
                          job.job_id, job.name, exc, traceback.format_exc())
                await self._broadcast("job_error", job)
            finally:
                self._queue.task_done()

    def cancel(self, job_id: str) -> bool:
        """Request cancellation of a queued or running job. Returns True if found."""
        job = self._jobs.get(job_id)
        if job and job.status in (JobStatus.QUEUED, JobStatus.RUNNING):
            job.request_cancel()
            return True
        return False

    async def _broadcast(self, event: str, job: Job) -> None:
        if not self._manager:
            return
        data: dict[str, Any] = {
            "job_id": job.job_id,
            "tool":   job.tool,
            "name":   job.name,
        }
        if event == "job_progress":
            data["progress"]    = job.progress
            data["eta_seconds"] = job.eta_seconds
            data["stage"]       = job.stage
        elif event == "job_complete":
            data["result_path"] = job.result_path
        elif event == "job_error":
            data["error"] = job.error
        # job_cancelled carries no extra payload beyond job_id/tool/name
        await self._manager.broadcast(event, data)

    async def enqueue(
        self,
        name: str,
        tool: str,
        fn: Callable[[Job], Awaitable[Any]],
    ) -> str:
        job_id = str(uuid.uuid4())[:8]
        job    = Job(job_id=job_id, name=name, tool=tool, fn=fn)
        self._jobs[job_id] = job

        # Prune finished jobs to prevent unbounded growth
        _KEEP = 200
        if len(self._jobs) > _KEEP:
            terminal = {JobStatus.DONE, JobStatus.ERROR, JobStatus.CANCELLED}
            stale = [jid for jid, j in self._jobs.items()
                     if j.status in terminal]
            for jid in stale[:len(self._jobs) - _KEEP]:
                del self._jobs[jid]

        await self._queue.put(job)
        if self._manager:
            await self._manager.broadcast("job_queued", {
                "job_id": job_id, "name": name, "tool": tool,
            })
        return job_id

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    @property
    def queue_depth(self) -> int:
        return self._queue.qsize()


gpu_queue = GpuJobQueue()
