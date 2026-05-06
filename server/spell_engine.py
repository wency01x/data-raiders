import asyncio
import functools
import time
from server.db import get_connection
from server.game_state import state
from server.event_bus import bus

_db_lock = asyncio.Lock()

# ── Per-player mistake tracking / rate limiting ───────────────────────────────
_MISTAKE_LIMIT   = 3          # consecutive wrong casts before roast + cooldown
_COOLDOWN_SECS   = 5.0        # how long the cooldown lasts (seconds)
_mistake_streak: dict[str, int]   = {}   # player_id -> consecutive wrong casts
_cooldown_until:  dict[str, float] = {}   # player_id -> epoch timestamp

ROAST_MESSAGES = [
    "Are you not that dumb right? XD",
    "Bro please read the objective 💀",
    "Skill issue detected. Cooling down...",
    "3 wrong casts? Taking a breather for ya XD",
]


def _record_mistake(player_id: str) -> str | None:
    """
    Increment this player's consecutive mistake counter.
    Returns a roast string if they just hit the limit (and sets a cooldown),
    otherwise returns None.
    """
    streak = _mistake_streak.get(player_id, 0) + 1
    _mistake_streak[player_id] = streak
    if streak >= _MISTAKE_LIMIT:
        _cooldown_until[player_id] = time.monotonic() + _COOLDOWN_SECS
        _mistake_streak[player_id] = 0   # reset so the next burst triggers again
        import random
        return random.choice(ROAST_MESSAGES)
    return None


def _record_success(player_id: str):
    """Reset the mistake streak on any successful cast."""
    _mistake_streak.pop(player_id, None)


async def _apply_player_damage(player_id: str, amount: int = 1):
    """Damage a player and, if they just died, broadcast the event (no respawn)."""
    died = await state.damage_player(player_id, amount)
    if died:
        async with state.lock:
            p = state.players.get(player_id)
            name = p.name if p else player_id
            player_count = len(state.players)
            if p:
                p.lives -= 1
                lives_left = p.lives
            else:
                lives_left = 0
        await bus.enqueue({"type": "player_died", "player_id": player_id, "player_name": name, "lives_left": lives_left})
        
        # If they have lives left or are playing alone, respawn them
        if lives_left > 0 or player_count == 1:
            asyncio.create_task(_respawn_after(player_id, delay=3.0))

async def _respawn_after(player_id: str, delay: float):
    await asyncio.sleep(delay)
    await state.respawn_player(player_id)
    await bus.enqueue({"type": "player_respawned", "player_id": player_id})


# ── Thread-pool helper ────────────────────────────────────────────────────────
# SQLite operations are synchronous (blocking I/O).  Running them on the main
# asyncio event loop would stall ALL WebSocket message handling while the DB
# responds.  asyncio.run_in_executor() offloads each DB call to a background
# thread from Python's default ThreadPoolExecutor, so the event loop stays free
# to process movement / spell / chat messages from other players concurrently.

async def _run_in_thread(func, *args):
    """
    Run a blocking synchronous function in the default thread pool.
    Demonstrates multithreading: DB I/O runs on a worker thread while
    the asyncio event loop continues handling other coroutines.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, functools.partial(func, *args))


# ── Room-specific objective checkers ─────────────────────────────────────────

def _check_room1(enemy_extra: dict, spell: str) -> tuple[bool, str]:
    """Room 1: DELETE only rows WHERE status = 'CORRUPTED'"""
    if spell == "DELETE":
        if enemy_extra.get("status") == "CORRUPTED":
            return True, "Correct! This record was CORRUPTED."
        else:
            return False, f"WRONG TARGET! This employee's status is '{enemy_extra.get('status')}', not 'CORRUPTED'. -1 HP"
    return True, ""

def _check_room2(enemy_extra: dict, spell: str) -> tuple[bool, str]:
    """Room 2: DELETE only rows WHERE dept = 'BUGS'"""
    if spell == "DELETE":
        if enemy_extra.get("dept") == "BUGS":
            return True, "Correct! Eliminated a BUGS department record."
        else:
            return False, f"WRONG TARGET! This employee is in '{enemy_extra.get('dept')}' dept, not 'BUGS'. -1 HP"
    return True, ""

def _check_room3(enemy_extra: dict, spell: str) -> tuple[bool, str]:
    """Room 3: UPDATE only rows WHERE role = 'Dev'"""
    if spell == "UPDATE":
        if enemy_extra.get("role") == "Dev":
            return True, "Correct! Updated a Dev's salary."
        else:
            return False, f"WRONG TARGET! This employee's role is '{enemy_extra.get('role')}', not 'Dev'. -1 HP"
    return True, ""

def _check_room4(enemy_extra: dict, spell: str) -> tuple[bool, str]:
    """Room 4: FK constraints — handled by existing depends_on logic"""
    return True, ""

def _check_room5(enemy_extra: dict, spell: str) -> tuple[bool, str]:
    """Room 5: Boss — must follow SELECT → UPDATE → DELETE phase order"""
    phase = enemy_extra.get("phase", 1)
    if phase == 1 and spell != "SELECT":
        return False, f"Phase 1: You must SELECT first to discover the weakness! -1 HP"
    if phase == 2 and spell != "UPDATE":
        return False, f"Phase 2: Use UPDATE to exploit the weakness! -1 HP"
    if phase == 3 and spell != "DELETE":
        return False, f"Phase 3: Use DELETE to finish the boss! -1 HP"
    return True, ""

ROOM_CHECKERS = {
    1: _check_room1,
    2: _check_room2,
    3: _check_room3,
    4: _check_room4,
    5: _check_room5,
}


async def cast_spell(player_id: str, spell: str, target_id: int | None) -> dict:
    spell = spell.upper()

    # ── Rate-limit check ──────────────────────────────────────────────────
    until = _cooldown_until.get(player_id, 0.0)
    remaining = until - time.monotonic()
    if remaining > 0:
        return {
            "success": False,
            "message": f"🔕 Cooldown! Calm down and think for {remaining:.1f}s more... XD",
        }

    if spell not in state.allowed_spells and spell != "SELECT":
        return {"success": False, "message": f"Spell {spell} not available in this room! Allowed: {', '.join(state.allowed_spells)}"}

    if spell == "SELECT":
        result = await _spell_select(player_id, target_id)
    elif spell == "DELETE":
        result = await _spell_delete(player_id, target_id)
    elif spell == "INSERT":
        result = await _spell_insert(player_id)
    elif spell == "UPDATE":
        result = await _spell_update(player_id, target_id)
    elif spell == "JOIN":
        result = await _spell_join()
    else:
        return {"success": False, "message": f"Unknown spell: {spell}"}

    # ── Update mistake streak ─────────────────────────────────────────────
    if result.get("success"):
        _record_success(player_id)
    else:
        # Only roast on wrong-target failures (messages containing "-1 HP" or "WRONG" or "FK CONSTRAINT")
        msg = result.get("message", "")
        if any(k in msg for k in ("-1 HP", "WRONG", "FK CONSTRAINT", "Phase")):
            roast = _record_mistake(player_id)
            if roast:
                result = dict(result)
                result["message"] = result["message"] + f"  \u2014  {roast}"

    return result


async def _spell_select(player_id: str, target_id: int | None) -> dict:
    if target_id is None:
        return {"success": False, "message": "SELECT needs a target. Walk near an enemy and press E."}

    # ── DB read runs in a thread pool — non-blocking for other players ────
    def _do_select():
        conn = get_connection()
        try:
            room = state.current_room
            row = conn.execute(
                f"SELECT * FROM {room} WHERE id = ? AND alive = 1", (target_id,)
            ).fetchone()
            return row, list(row.keys()) if row else []
        finally:
            conn.close()

    print(f"[ThreadPool] SELECT query for target {target_id} dispatched to worker thread.")
    row, cols = await _run_in_thread(_do_select)

    if not row:
        return {"success": False, "message": "No target found."}

    parts = [f"{c}={row[c]}" for c in cols if c not in ("tile_x", "tile_y", "alive", "depends_on")]
    info = " | ".join(parts)

    # Room 5 boss: advance phase on SELECT
    if state.room_number == 5:
        async with state.lock:
            enemy = state.enemies.get(target_id)
            if enemy and enemy.extra.get("phase") == 1:
                checker = ROOM_CHECKERS.get(5)
                valid, reason = checker(enemy.extra, "SELECT")
                if valid:
                    enemy.extra["phase"] = 2

                    def _advance_phase():
                        conn = get_connection()
                        try:
                            conn.execute(f"UPDATE {state.current_room} SET phase=2 WHERE id=?", (target_id,))
                            conn.commit()
                        finally:
                            conn.close()

                    await _run_in_thread(_advance_phase)
                    return {"success": True, "message": f"SELECT reveals: {info}\n⚡ Weakness found: REINDEX! Use UPDATE next!", "affected_id": target_id}

    await state.add_score(player_id, 5)
    return {"success": True, "message": f"SELECT → {info}", "affected_id": target_id}


async def _spell_delete(player_id: str, target_id: int | None) -> dict:
    if target_id is None:
        return {"success": False, "message": "DELETE needs a target."}

    # ── FK constraint check ───────────────────────────────────────────────
    async with state.lock:
        blockers = [e for e in state.enemies.values() if e.alive and target_id in e.depends_on]
        if blockers:
            names = ", ".join(e.label for e in blockers)
    if blockers:
        await _apply_player_damage(player_id, 1)
        return {
            "success": False,
            "message": (
                f"FK CONSTRAINT VIOLATION! "
                f"{names} still reference{'s' if len(blockers)==1 else ''} "
                f"this row. Delete child rows first! (-1 HP)"
            ),
        }

    # ── Room objective check ──────────────────────────────────────────────
    async with state.lock:
        enemy = state.enemies.get(target_id)
        if not enemy or not enemy.alive:
            return {"success": False, "message": "Target not found or already deleted."}
        checker = ROOM_CHECKERS.get(state.room_number)
        if checker:
            valid, reason = checker(enemy.extra, "DELETE")
        else:
            valid, reason = True, ""
    if not valid:
        await _apply_player_damage(player_id, 1)
        return {"success": False, "message": reason}

    # ── DB write in thread pool ───────────────────────────────────────────
    async with _db_lock:
        room = state.current_room

        def _do_delete():
            conn = get_connection()
            try:
                row = conn.execute(
                    f"SELECT * FROM {room} WHERE id = ? AND alive = 1", (target_id,)
                ).fetchone()
                if not row:
                    return None, None
                new_hp = row["hp"] - 2
                if new_hp <= 0:
                    conn.execute(f"UPDATE {room} SET hp=0, alive=0 WHERE id=?", (target_id,))
                else:
                    conn.execute(f"UPDATE {room} SET hp=? WHERE id=?", (new_hp, target_id))
                conn.commit()
                return row, new_hp
            finally:
                conn.close()

        print(f"[ThreadPool] DELETE spell DB write for target {target_id} dispatched to worker thread.")
        row, new_hp = await _run_in_thread(_do_delete)

    if row is None:
        return {"success": False, "message": "Target not found or already deleted."}

    if new_hp <= 0:
        async with state.lock:
            if target_id in state.enemies:
                state.enemies[target_id].alive = False
        await state.add_score(player_id, 25)
        return {"success": True, "message": f"DELETE destroyed [{row['label']}]! +25 pts", "affected_id": target_id}
    else:
        async with state.lock:
            if target_id in state.enemies:
                state.enemies[target_id].hp = new_hp
        await state.add_score(player_id, 10)
        return {"success": True, "message": f"DELETE hit [{row['label']}] — {new_hp} HP left. +10 pts", "affected_id": target_id}


async def _spell_insert(player_id: str) -> dict:
    async with state.lock:
        p = state.players.get(player_id)
        if not p:
            return {"success": False, "message": "Player not found."}
        tile_x = int(p.x // 40) + 1
        tile_y = int(p.y // 40)
    return {"success": True, "message": f"INSERT placed barrier at ({tile_x},{tile_y}).",
            "wall": {"tile_x": tile_x, "tile_y": tile_y}}


async def _spell_update(player_id: str, target_id: int | None) -> dict:
    if target_id is None:
        return {"success": False, "message": "UPDATE needs a target."}

    # ── Room objective check ──────────────────────────────────────────────
    async with state.lock:
        enemy = state.enemies.get(target_id)
        if not enemy or not enemy.alive:
            return {"success": False, "message": "Target not found."}
        checker = ROOM_CHECKERS.get(state.room_number)
        if checker:
            valid, reason = checker(enemy.extra, "UPDATE")
        else:
            valid, reason = True, ""
    if not valid:
        await _apply_player_damage(player_id, 1)
        return {"success": False, "message": reason}

    # ── DB write in thread pool ───────────────────────────────────────────
    async with _db_lock:
        room = state.current_room
        room_num = state.room_number

        def _do_update():
            conn = get_connection()
            try:
                row = conn.execute(
                    f"SELECT * FROM {room} WHERE id = ? AND alive = 1", (target_id,)
                ).fetchone()
                if not row:
                    return None, None, None
                # Room 5 boss phase 2 → 3
                if room_num == 5:
                    return row, row["hp"], "boss_check"
                new_hp = max(1, row["hp"] // 2)
                conn.execute(f"UPDATE {room} SET hp=? WHERE id=?", (new_hp, target_id))
                conn.commit()
                return row, new_hp, "normal"
            finally:
                conn.close()

        print(f"[ThreadPool] UPDATE spell DB write for target {target_id} dispatched to worker thread.")
        row, new_hp, mode = await _run_in_thread(_do_update)

    if row is None:
        return {"success": False, "message": "Target not found."}

    if mode == "boss_check":
        async with state.lock:
            e = state.enemies.get(target_id)
            if e and e.extra.get("phase") == 2:
                e.extra["phase"] = 3
                boss_hp = max(1, row["hp"] // 3)
                e.hp = boss_hp

                def _boss_update():
                    conn = get_connection()
                    try:
                        conn.execute(f"UPDATE {room} SET hp=?, phase=3 WHERE id=?", (boss_hp, target_id))
                        conn.commit()
                    finally:
                        conn.close()

                await _run_in_thread(_boss_update)
                await state.add_score(player_id, 30)
                return {"success": True, "message": f"UPDATE exploited weakness! Boss weakened to {boss_hp} HP! Use DELETE to finish! +30 pts", "affected_id": target_id}

    # Normal UPDATE path
    async with state.lock:
        if target_id in state.enemies:
            state.enemies[target_id].hp = new_hp
    await state.add_score(player_id, 15)

    if room_num == 3 and new_hp <= 1:
        def _kill_dev():
            conn = get_connection()
            try:
                conn.execute(f"UPDATE {room} SET hp=0, alive=0 WHERE id=?", (target_id,))
                conn.commit()
            finally:
                conn.close()

        await _run_in_thread(_kill_dev)
        async with state.lock:
            if target_id in state.enemies:
                state.enemies[target_id].alive = False
                state.enemies[target_id].hp = 0
        return {"success": True, "message": f"UPDATE complete on [{row['label']}]! Record updated and cleared. +15 pts", "affected_id": target_id}

    return {"success": True, "message": f"UPDATE weakened [{row['label']}] to {new_hp} HP. +15 pts", "affected_id": target_id}


async def _spell_join() -> dict:
    def _do_join():
        conn = get_connection()
        try:
            alive = conn.execute(
                f"SELECT COUNT(*) as cnt FROM {state.current_room} WHERE alive = 1"
            ).fetchone()["cnt"]
            if alive > 0:
                return alive, False
            conn.execute(
                "UPDATE rooms SET unlocked=1 WHERE id=(SELECT id FROM rooms WHERE unlocked=0 ORDER BY id ASC LIMIT 1)"
            )
            conn.commit()
            return alive, True
        finally:
            conn.close()

    print(f"[ThreadPool] JOIN check dispatched to worker thread.")
    alive, unlocked = await _run_in_thread(_do_join)
    if not unlocked:
        return {"success": False, "message": f"JOIN failed — {alive} enemies still alive!"}
    return {"success": True, "message": "JOIN successful — next room unlocked!"}