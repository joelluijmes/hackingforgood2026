"""In-memory background tasks (generate / translate). Hackathon scope: lost on restart."""

import logging
import threading
import time
import uuid
from collections import OrderedDict
from collections.abc import Callable

log = logging.getLogger("icf.tasks")

# overall progress range of each step inside one unit of work
_RANGE = {
    "queued": (0.0, 0.0),
    "reading": (0.0, 0.05),
    "filling": (0.05, 0.90),
    "comments": (0.90, 0.97),
    "saving": (0.97, 1.0),
    "done": (1.0, 1.0),
}
MAX_TASKS = 100
_lock = threading.Lock()
_tasks: OrderedDict[str, dict] = OrderedDict()


class Reporter:
    """Callable ``report(step, done, total)``; ``segment`` selects a per-language slice."""

    def __init__(self, task: dict):
        self.task = task
        self.base, self.span = 0.0, 1.0

    def segment(self, index: int, count: int, language: str | None) -> None:
        self.base, self.span = index / count, 1 / count
        with _lock:
            self.task["language"] = language

    def __call__(self, step: str, done: int, total: int) -> None:
        lo, hi = _RANGE.get(step, (0.0, 0.0))
        frac = min(1.0, done / total) if total else 1.0
        with _lock:
            t = self.task
            t["step"], t["done"], t["total"] = step, done, total
            t["progress"] = round(self.base + self.span * (lo + (hi - lo) * frac), 4)


def start_task(kind: str, fn: Callable[[Reporter], dict], language: str | None = None) -> str:
    task = {
        "id": uuid.uuid4().hex,
        "kind": kind,
        "status": "running",
        "step": "queued",
        "done": 0,
        "total": 0,
        "progress": 0.0,
        "language": language,
        "started": time.time(),
        "elapsed_s": 0.0,
        "result": None,
        "error": None,
    }
    with _lock:
        _tasks[task["id"]] = task
        while len(_tasks) > MAX_TASKS:
            _tasks.popitem(last=False)
    report = Reporter(task)

    def run() -> None:
        try:
            result = fn(report)
            with _lock:
                task.update(status="done", step="done", progress=1.0, result=result)
        except Exception as exc:  # noqa: BLE001
            log.exception("task %s failed", task["id"])
            with _lock:
                task.update(status="failed", error=str(exc) or exc.__class__.__name__)
        finally:
            with _lock:
                task["elapsed_s"] = round(time.time() - task["started"], 1)

    threading.Thread(target=run, daemon=True, name=f"task-{kind}").start()
    return task["id"]


def get_task(task_id: str) -> dict | None:
    with _lock:
        t = _tasks.get(task_id)
        if t is None:
            return None
        out = {k: v for k, v in t.items() if k != "started"}
        if t["status"] == "running":
            out["elapsed_s"] = round(time.time() - t["started"], 1)
        return out
