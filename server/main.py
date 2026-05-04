import asyncio
import json
import re
import time
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from server.db import init_db, get_connection
from server.game_state import state
from server.event_bus import bus
from server.spell_engine import cast_spell
from shared.constants import TICK_RATE

_start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _load_room("enemies_room1")
    # Start background tasks: game tick + event queue consumer
    asyncio.create_task(_game_tick_loop())
    asyncio.create_task(bus.consume_events())   # <-- Queue consumer coroutine
    print("[Server] Data Raiders ready. Waiting for players...")
    print(f"[Server] Tick rate: {TICK_RATE} Hz | Thread pool executor: active")
    yield


app = FastAPI(title="Data Raiders", lifespan=lifespan)

# ── Serve built Vite frontend from /client ────────────────────────────────────
_dist_dir = os.path.join(os.path.dirname(__file__), "..", "webclient", "dist")
if os.path.isdir(_dist_dir):
    app.mount("/client", StaticFiles(directory=_dist_dir, html=True), name="client")
    print(f"[Server] Serving frontend from {_dist_dir}")
else:
    print("[Server] No webclient/dist found — run `npm run build` in webclient/ to enable LAN serving.")


def _load_room(table: str):
    conn = get_connection()
    enemies = conn.execute(f"SELECT * FROM {table}").fetchall()
    room_row = conn.execute("SELECT * FROM rooms WHERE table_ref=?", (table,)).fetchone()
    room_id = room_row["id"] if room_row else 1
    loot = conn.execute("SELECT * FROM loot WHERE room_id = ?", (room_id,)).fetchall()
    conn.close()
    state.load_enemies(enemies)
    state.load_loot(loot)
    state.current_room = table
    state.load_room_info(room_row)


async def _game_tick_loop():
    """
    Game state synchronization loop.
    Runs at TICK_RATE Hz and broadcasts the full game snapshot to all players.
    This is the core of real-time multiplayer: every connected client receives
    position, HP, and event data on every tick.
    """
    interval = 1.0 / TICK_RATE
    while True:
        await asyncio.sleep(interval)
        if bus.player_count > 0:
            await bus.broadcast(state.snapshot())


def _safe_query(sql: str) -> bool:
    """Only allow read-only SELECT queries (block mutations)."""
    s = sql.strip()
    if not s:
        return False
    first_word = s.split()[0].upper()
    return first_word == "SELECT"


# ── Stats endpoint — exposes live concurrency metrics ────────────────────────

@app.get("/stats")
async def get_stats():
    """
    Returns live server metrics used by the in-game Server Stats widget.
    Demonstrates that the distributed system is actively running:
      - player_count:      how many WebSocket connections are open
      - tick_rate:         game state broadcast frequency (Hz)
      - uptime_seconds:    server uptime
      - event_queue_size:  events pending in the async queue right now
      - events_processed:  total events dispatched by the consumer task
      - current_room:      active dungeon room
    """
    return JSONResponse({
        "players_online": bus.player_count,
        "tick_rate": TICK_RATE,
        "uptime_seconds": int(time.time() - _start_time),
        "event_queue_size": bus.queue_size,
        "events_processed": bus.events_processed,
        "current_room": state.current_room,
        "room_number": state.room_number,
    })


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    player = None

    try:
        raw = await ws.receive_text()
        msg = json.loads(raw)
        if msg.get("type") != "join":
            return
        player_name = msg.get("player_name", "Anonymous")
    except (WebSocketDisconnect, Exception):
        return

    player = await state.add_player(player_name)
    await bus.connect(player.id, ws)
    print(f"[Server] {player.name} joined (id={player.id}) | Players online: {bus.player_count}")

    # Notify peers via queue (producer)
    await bus.enqueue({
        "type": "player_joined",
        "player_id": player.id,
        "player_name": player.name,
        "color_idx": player.color_idx,
    }, exclude=player.id)

    # Send private welcome directly (not via queue — must arrive before game state)
    await bus.send_to(player.id, {
        "type": "welcome",
        "player_id": player.id,
        "color_idx": player.color_idx,
    })

    try:
        while True:
            raw      = await ws.receive_text()
            msg      = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "move":
                await state.move_player(player.id, msg.get("dx", 0), msg.get("dy", 0))

            elif msg_type == "spell":
                spell  = msg.get("spell", "")
                target = msg.get("target_id")
                result = await cast_spell(player.id, spell, target)

                await bus.send_to(player.id, {
                    "type": "spell_result",
                    "player_id": player.id,
                    "spell": spell,
                    **result,
                })
                # Spell cast event → enqueued for async broadcast (producer)
                await bus.enqueue({
                    "type": "spell_cast",
                    "player_id": player.id,
                    "spell": spell,
                    "affected_id": result.get("affected_id"),
                })

            elif msg_type == "query":
                sql = msg.get("sql", "").strip().rstrip(";").strip()
                if not sql:
                    await bus.send_to(player.id, {
                        "type": "query_result",
                        "success": False,
                        "message": "Empty query.",
                        "columns": [],
                        "rows": [],
                    })
                elif not _safe_query(sql):
                    await bus.send_to(player.id, {
                        "type": "query_result",
                        "success": False,
                        "message": "Only SELECT queries allowed! No mutations permitted.",
                        "columns": [],
                        "rows": [],
                    })
                else:
                    conn = get_connection()
                    try:
                        cursor = conn.execute(sql)
                        rows = cursor.fetchmany(20)
                        columns = [desc[0] for desc in cursor.description] if cursor.description else []
                        result_rows = [list(row) for row in rows]
                        total = conn.execute(f"SELECT COUNT(*) FROM ({sql})").fetchone()[0]
                        await bus.send_to(player.id, {
                            "type": "query_result",
                            "success": True,
                            "message": f"Query returned {total} row(s)" + (f" (showing first 20)" if total > 20 else ""),
                            "columns": columns,
                            "rows": result_rows,
                        })
                        await state.add_score(player.id, 5)
                    except Exception as e:
                        await bus.send_to(player.id, {
                            "type": "query_result",
                            "success": False,
                            "message": f"SQL Error: {str(e)}",
                            "columns": [],
                            "rows": [],
                        })
                    finally:
                        conn.close()

            elif msg_type == "reset":
                init_db()
                _load_room("enemies_room1")
                async with state.lock:
                    for p in state.players.values():
                        p.hp = p.max_hp
                        p.score = 0
                print(f"[Server] {player.name} triggered a game reset.")
                # Reset notification → enqueued
                await bus.enqueue({
                    "type": "reset_ack",
                    "message": f"{player.name} reset the game!",
                })

            elif msg_type == "next_room":
                conn = get_connection()
                next_room = conn.execute("SELECT * FROM rooms WHERE unlocked=0 ORDER BY id ASC LIMIT 1").fetchone()
                if next_room:
                    conn.execute("UPDATE rooms SET unlocked=1 WHERE id=?", (next_room["id"],))
                    conn.commit()
                    tbl = next_room["table_ref"]
                    conn.close()
                    _load_room(tbl)
                    async with state.lock:
                        for i, p in enumerate(state.players.values()):
                            p.x = float((i + 1) * 2 * 56)
                            p.y = float(2 * 56)
                    await bus.enqueue({
                        "type": "reset_ack",
                        "message": f"Entering Room {next_room['id']}: {next_room['name']}!",
                    })
                else:
                    conn.close()
                    total_scores = []
                    async with state.lock:
                        for p in state.players.values():
                            total_scores.append(f"{p.name}: {p.score} pts")
                    score_str = " | ".join(total_scores)
                    await bus.enqueue({
                        "type": "spell_result",
                        "player_id": player.id,
                        "spell": "JOIN",
                        "success": True,
                        "message": f"🎉 VICTORY! All rooms cleared! Final scores: {score_str}",
                    })

            elif msg_type == "chat":
                await bus.enqueue({
                    "type": "chat",
                    "sender": player.name,
                    "text": msg.get("text", ""),
                }, exclude=player.id)

    except (WebSocketDisconnect, Exception):
        pass
    finally:
        if player:
            await state.remove_player(player.id)
            await bus.disconnect(player.id)
            await bus.enqueue({"type": "player_left", "player_id": player.id})
            print(f"[Server] {player.name} disconnected. | Players online: {bus.player_count}")