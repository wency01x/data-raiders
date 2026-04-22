import asyncio
import json
from fastapi import WebSocket


class EventBus:
    def __init__(self):
        self._connections: dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def connect(self, player_id: str, ws: WebSocket):
        async with self._lock:
            self._connections[player_id] = ws

    async def disconnect(self, player_id: str):
        async with self._lock:
            self._connections.pop(player_id, None)

    async def send_to(self, player_id: str, data: dict):
        async with self._lock:
            ws = self._connections.get(player_id)
        if ws:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                pass

    async def broadcast(self, data: dict, exclude: str | None = None):
        async with self._lock:
            targets = {pid: ws for pid, ws in self._connections.items() if pid != exclude}
        if targets:
            await asyncio.gather(
                *[ws.send_text(json.dumps(data)) for ws in targets.values()],
                return_exceptions=True
            )

    @property
    def player_count(self) -> int:
        return len(self._connections)


bus = EventBus()