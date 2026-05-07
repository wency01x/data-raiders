import asyncio
import json
import re
import time
import os
import socket
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from server.db import init_db, get_connection
from server.game_state import state
from server.event_bus import bus
from server.spell_engine import cast_spell
from shared.constants import TICK_RATE

_start_time = time.time()
_lobby_open: bool = False    # Host must explicitly open the lobby before anyone can join
_game_started: bool = False  # Set to True when host clicks START ADVENTURE; reset when all leave


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

# Allow all LAN clients to fetch HTTP endpoints (lobby info, stats) from a browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

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


import random
import math
from shared.constants import TICK_RATE, MAP_COLS, MAP_ROWS, TILE_SIZE

async def _game_tick_loop():
    """
    Game state synchronization loop.
    Runs at TICK_RATE Hz and broadcasts the full game snapshot to all players.
    This is the core of real-time multiplayer: every connected client receives
    position, HP, and event data on every tick.
    """
    interval = 1.0 / TICK_RATE
    boss_tx, boss_ty = None, None
    boss_speed = 60.0
    
    while True:
        await asyncio.sleep(interval)
        
        # Room 5 Boss Roaming Logic
        async with state.lock:
            if state.room_number == 5 and state.game_phase == "PLAYING":
                boss = next((e for e in state.enemies.values() if e.alive), None)
                if boss:
                    if boss_tx is None or math.hypot(boss.x - boss_tx, boss.y - boss_ty) < 10:
                        boss_tx = random.uniform(2 * TILE_SIZE, (MAP_COLS - 4) * TILE_SIZE)
                        boss_ty = random.uniform(2 * TILE_SIZE, (MAP_ROWS - 4) * TILE_SIZE)
                    
                    dx = boss_tx - boss.x
                    dy = boss_ty - boss.y
                    dist = math.hypot(dx, dy)
                    if dist > 0:
                        move_dist = min(dist, boss_speed * interval)
                        boss.x += (dx / dist) * move_dist
                        boss.y += (dy / dist) * move_dist

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


def _get_local_ip() -> str:
    """Detect the machine's LAN IP address for display in the lobby."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


@app.get("/lobby")
async def get_lobby():
    """
    Returns lobby-level server info. Clients poll this before connecting.
    'open' indicates whether the host has opened the lobby for players.
    """
    return JSONResponse({
        "server_ip": _get_local_ip(),
        "port": 8000,
        "players_online": bus.player_count,
        "room_number": state.room_number,
        "uptime_seconds": int(time.time() - _start_time),
        "open": _lobby_open,
        "started": _game_started,
        "status": "open" if _lobby_open else "closed",
    })


@app.post("/lobby/open")
async def open_lobby():
    """Host calls this to open the lobby so other players can join."""
    global _game_started, _lobby_open
    if _lobby_open:
        return JSONResponse({"open": True, "status": "already_open", "error": "Lobby is already open by another player."}, status_code=400)
    
    _lobby_open = True
    _game_started = False
    state.game_phase = "LOBBY"
    print("[Server] Lobby OPENED by host.")
    return JSONResponse({"open": True, "status": "opened"})


@app.post("/lobby/close")
async def close_lobby():
    """Host calls this to close the lobby (no new players can join)."""
    global _lobby_open
    _lobby_open = False
    print("[Server] Lobby CLOSED by host.")
    return JSONResponse({"open": False, "status": "closed"})


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    global _game_started, _lobby_open
    await ws.accept()

    # Gate: reject connections when the host hasn't opened the lobby yet
    if not _lobby_open:
        await ws.send_json({
            "type": "lobby_closed",
            "message": "The host hasn't opened the lobby yet. Please wait.",
        })
        await ws.close()
        return

    # Gate: reject if game started
    if _game_started:
        await ws.send_json({
            "type": "lobby_closed",
            "message": "The game has already started.",
        })
        await ws.close()
        return

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
                if player.hp <= 0:
                    continue
                await state.move_player(player.id, msg.get("dx", 0), msg.get("dy", 0))

                # Check loot collisions
                async with state.lock:
                    for l in state.loot.values():
                        if not l.collected:
                            px = player.x + 28
                            py = player.y + 28
                            lx = l.tile_x * 56 + 28
                            ly = l.tile_y * 56 + 28
                            dist = ((px - lx)**2 + (py - ly)**2)**0.5
                            if dist < 40:
                                l.collected = True
                                if l.label == "health":
                                    player.hp = min(player.hp + 1, player.max_hp)
                                    # Broadcast message? Not strictly needed, HP is synced via tick.
                                else:
                                    player.score += l.value
                                
                                # Background update DB
                                def _collect_loot(lid):
                                    from server.db import get_connection
                                    conn = get_connection()
                                    conn.execute("UPDATE loot SET collected=1 WHERE id=?", (lid,))
                                    conn.commit()
                                    conn.close()
                                asyncio.get_running_loop().run_in_executor(None, _collect_loot, l.id)

            elif msg_type == "spell":
                if player.hp <= 0:
                    continue
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
                if player.hp <= 0:
                    continue
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
                state.game_phase = "PLAYING"
                print(f"[Server] {player.name} triggered a game reset.")
                # Reset notification → enqueued
                await bus.enqueue({
                    "type": "reset_ack",
                    "message": f"{player.name} reset the game!",
                })

            elif msg_type == "start_game":
                _game_started = True
                state.game_phase = "JOURNEY_MAP"
                await bus.enqueue({"type": "reset_ack", "message": "The adventure begins!"})
                
                async def start_playing():
                    await asyncio.sleep(4)
                    state.game_phase = "PLAYING"
                asyncio.create_task(start_playing())

            elif msg_type == "trigger_level_complete":
                if state.game_phase == "PLAYING":
                    state.game_phase = "LEVEL_COMPLETE"
                    async def transition():
                        await asyncio.sleep(3)
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
                                    # Revive players if they died in the previous room
                                    if p.lives <= 0:
                                        p.lives = 3
                                        p.hp = p.max_hp
                            state.game_phase = "JOURNEY_MAP"
                            await bus.enqueue({
                                "type": "reset_ack",
                                "message": f"Entering Level {next_room['id']}: {next_room['name']}!",
                            })
                            await asyncio.sleep(4)
                            state.game_phase = "PLAYING"
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
                                "message": f"🎉 VICTORY! All levels cleared! Final scores: {score_str}",
                            })
                            state.game_phase = "VICTORY"
                    asyncio.create_task(transition())

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
            await bus.enqueue({"type": "player_left", "player_id": player.id, "player_name": player.name})
            print(f"[Server] {player.name} disconnected. | Players online: {bus.player_count}")

            # When the last player leaves, reset all session state so a new game can be hosted
            if bus.player_count == 0:
                # (globals declared at top of function)
                _lobby_open = False
                _game_started = False
                state.game_phase = "LOBBY"
                print("[Server] All players disconnected — lobby reset for new session.")