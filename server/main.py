import asyncio
import json
import re
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from server.db import init_db, get_connection
from server.game_state import state
from server.event_bus import bus
from server.spell_engine import cast_spell
from shared.constants import TICK_RATE


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _load_room("enemies_room1")
    asyncio.create_task(_game_tick_loop())
    print("[Server] Data Raiders ready. Waiting for players...")
    yield


app = FastAPI(title="Data Raiders", lifespan=lifespan)


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
    print(f"[Server] {player.name} joined (id={player.id})")

    await bus.broadcast({
        "type": "player_joined",
        "player_id": player.id,
        "player_name": player.name,
        "color_idx": player.color_idx,
    }, exclude=player.id)

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
                await bus.broadcast({
                    "type": "spell_cast",
                    "player_id": player.id,
                    "spell": spell,
                    "affected_id": result.get("affected_id"),
                })

            elif msg_type == "query":
                # In-game SQL terminal — read-only SELECT queries
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
                # Reset player HP and scores
                async with state.lock:
                    for p in state.players.values():
                        p.hp = p.max_hp
                        p.score = 0
                print(f"[Server] {player.name} triggered a game reset.")
                await bus.broadcast({
                    "type": "reset_ack",
                    "message": f"{player.name} reset the game!",
                })

            elif msg_type == "next_room":
                # Find the next locked room
                conn = get_connection()
                next_room = conn.execute("SELECT * FROM rooms WHERE unlocked=0 ORDER BY id ASC LIMIT 1").fetchone()
                if next_room:
                    conn.execute("UPDATE rooms SET unlocked=1 WHERE id=?", (next_room["id"],))
                    conn.commit()
                    tbl = next_room["table_ref"]
                    conn.close()
                    _load_room(tbl)
                    # Reset all player positions on room change
                    async with state.lock:
                        for i, p in enumerate(state.players.values()):
                            p.x = float((i + 1) * 2 * 56)
                            p.y = float(2 * 56)
                    await bus.broadcast({
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
                    await bus.broadcast({
                        "type": "spell_result",
                        "player_id": player.id,
                        "spell": "JOIN",
                        "success": True,
                        "message": f"🎉 VICTORY! All rooms cleared! Final scores: {score_str}",
                    })

            elif msg_type == "chat":
                await bus.broadcast({
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
            await bus.broadcast({"type": "player_left", "player_id": player.id})
            print(f"[Server] {player.name} disconnected.")