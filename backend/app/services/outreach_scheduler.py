"""In-process outreach ticker so 5-minute spaced jobs keep sending.

The HTTP drain after queue only lasts ~2 minutes, and Render cron is easy
to miss. This loop (plus a cheap health-check nudge) processes due jobs
every ~30s while the API process is awake.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

TICK_MIN_INTERVAL_SECONDS = 25
LOOP_SLEEP_SECONDS = 45


class TickGate:
    """Debounce ticks so health checks and the loop do not stampede SMTP."""

    def __init__(self, min_interval: float = TICK_MIN_INTERVAL_SECONDS) -> None:
        self.min_interval = min_interval
        self.last = datetime.min

    def should_run(self, now: Optional[datetime] = None) -> bool:
        now = now or datetime.utcnow()
        if (now - self.last).total_seconds() < self.min_interval:
            return False
        self.last = now
        return True


_gate = TickGate()
_lock = asyncio.Lock()


def run_outreach_tick_sync(budget_seconds: float = 40) -> dict:
    from app.db.session import SessionLocal
    from app.services.outreach_runner import OutreachRunner

    db = SessionLocal()
    try:
        runner = OutreachRunner(db)
        runner.reclaim_stale_jobs()
        return runner.tick(limit=25, budget_seconds=budget_seconds)
    finally:
        db.close()


async def _tick_safe(budget_seconds: float = 40) -> None:
    async with _lock:
        try:
            result = await asyncio.to_thread(run_outreach_tick_sync, budget_seconds)
            jobs = (result or {}).get("outreach_jobs") or {}
            sent = jobs.get("sent") or 0
            deferred = jobs.get("deferred") or 0
            if sent or deferred:
                logger.info(
                    "Outreach scheduler: sent=%s deferred=%s processed=%s",
                    sent,
                    deferred,
                    jobs.get("processed"),
                )
        except Exception:
            logger.exception("Outreach scheduler tick failed")


def maybe_tick_in_background() -> None:
    """Non-blocking nudge from /health. Never waits on SMTP."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    if not _gate.should_run():
        return
    loop.create_task(_tick_safe())


async def outreach_tick_loop() -> None:
    await asyncio.sleep(8)
    while True:
        try:
            if _gate.should_run():
                await _tick_safe()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Outreach scheduler loop error")
        await asyncio.sleep(LOOP_SLEEP_SECONDS)
