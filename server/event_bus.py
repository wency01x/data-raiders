import asyncio
import json
from fastapi import WebSocket


class EventBus:
    """
    Distributed event bus with a producer-consumer queue pattern.

    - Player handler coroutines act as **producers**: they call enqueue()
      to push game events (spell_cast, player_joined, etc.) onto the queue.
    - A dedicated background **consumer** task (consume_events) drains the
      queue and broadcasts each event to all connected WebSocket clients.
    - Direct game-state broadcasts (the 30 Hz tick) bypass the queue and
      call broadcast() directly for lowest latency.
    - All connection-map mutations are guarded by asyncio.Lock to prevent
      race conditions when multiple coroutines join/leave concurrently.
    """

    def __init__(self):
        self._connections: dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()
        # Async queue: producers push, consumer pulls
        self._event_queue: asyncio.Queue = asyncio.Queue()
        self._events_processed: int = 0
        self._lock_contentions: int = 0

    # ── Connection management ─────────────────────────────────────────────

    async def connect(self, player_id: str, ws: WebSocket):
        async with self._lock:
            self._connections[player_id] = ws

    async def disconnect(self, player_id: str):
        async with self._lock:
            self._connections.pop(player_id, None)

    # ── Direct send (used for private messages & high-frequency state) ────

    async def send_to(self, player_id: str, data: dict):
        async with self._lock:
            ws = self._connections.get(player_id)
        if ws:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                pass

    async def broadcast(self, data: dict, exclude: str | None = None):
        """Immediately broadcast to all connected clients (used by game tick)."""
        async with self._lock:
            targets = {
                pid: ws
                for pid, ws in self._connections.items()
                if pid != exclude
            }
        if targets:
            await asyncio.gather(
                *[ws.send_text(json.dumps(data)) for ws in targets.values()],
                return_exceptions=True,
            )

    # ── Queue-based async event dispatch ─────────────────────────────────

    async def enqueue(self, data: dict, exclude: str | None = None):
        """
        Producer: push a game event onto the async queue.
        The consumer task will process it asynchronously.
        """
        await self._event_queue.put((data, exclude))

    async def consume_events(self):
        """
        Consumer: background task that continuously drains the event queue
        and broadcasts each event to all connected players.

        This implements the producer-consumer concurrency pattern:
        - Multiple player coroutines produce events concurrently
        - This single consumer serialises broadcasts to avoid thundering herd
        """
        print("[EventBus] Consumer task started — event queue is live.")
        while True:
            try:
                data, exclude = await self._event_queue.get()
                await self.broadcast(data, exclude=exclude)
                self._events_processed += 1
                self._event_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception:
                pass

    # ── Metrics (exposed via /stats endpoint) ────────────────────────────

    @property
    def player_count(self) -> int:
        return len(self._connections)

    @property
    def queue_size(self) -> int:
        return self._event_queue.qsize()

    @property
    def events_processed(self) -> int:
        return self._events_processed


bus = EventBus()