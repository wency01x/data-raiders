import asyncio
from server.db import get_connection
from server.game_state import state

_db_lock = asyncio.Lock()

# ── Room-specific objective checkers ─────────────────────────────────────
# Each returns (is_valid_target: bool, reason: str)
# is_valid_target = True means this enemy SHOULD be affected by the spell

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

    # Check if spell is allowed in this room
    if spell not in state.allowed_spells and spell != "SELECT":
        return {"success": False, "message": f"Spell {spell} not available in this room! Allowed: {', '.join(state.allowed_spells)}"}

    if spell == "SELECT":
        return await _spell_select(player_id, target_id)
    elif spell == "DELETE":
        return await _spell_delete(player_id, target_id)
    elif spell == "INSERT":
        return await _spell_insert(player_id)
    elif spell == "UPDATE":
        return await _spell_update(player_id, target_id)
    elif spell == "JOIN":
        return await _spell_join()
    return {"success": False, "message": f"Unknown spell: {spell}"}


async def _spell_select(player_id: str, target_id: int | None) -> dict:
    if target_id is None:
        return {"success": False, "message": "SELECT needs a target. Walk near an enemy and press E."}

    conn = get_connection()
    try:
        room = state.current_room
        row  = conn.execute(
            f"SELECT * FROM {room} WHERE id = ? AND alive = 1", (target_id,)
        ).fetchone()
        if not row:
            return {"success": False, "message": "No target found."}

        # Build a full row display
        cols = row.keys()
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
                        conn.execute(f"UPDATE {room} SET phase=2 WHERE id=?", (target_id,))
                        conn.commit()
                        return {"success": True, "message": f"SELECT reveals: {info}\n⚡ Weakness found: REINDEX! Use UPDATE next!", "affected_id": target_id}

        await state.add_score(player_id, 5)
        return {"success": True, "message": f"SELECT → {info}", "affected_id": target_id}
    finally:
        conn.close()


async def _spell_delete(player_id: str, target_id: int | None) -> dict:
    if target_id is None:
        return {"success": False, "message": "DELETE needs a target."}

    # ── FK constraint check (room 4 primarily) ───────────────────────────
    async with state.lock:
        blockers = [
            e for e in state.enemies.values()
            if e.alive and target_id in e.depends_on
        ]
        if blockers:
            names = ", ".join(e.label for e in blockers)
            p = state.players.get(player_id)
            if p:
                p.hp = max(0, p.hp - 1)
            return {
                "success": False,
                "message": (
                    f"FK CONSTRAINT VIOLATION! "
                    f"{names} still reference{'s' if len(blockers)==1 else ''} "
                    f"this row. Delete child rows first! (-1 HP)"
                ),
            }

    # ── Room objective check ─────────────────────────────────────────────
    async with state.lock:
        enemy = state.enemies.get(target_id)
        if not enemy or not enemy.alive:
            return {"success": False, "message": "Target not found or already deleted."}

        checker = ROOM_CHECKERS.get(state.room_number)
        if checker:
            valid, reason = checker(enemy.extra, "DELETE")
            if not valid:
                p = state.players.get(player_id)
                if p:
                    p.hp = max(0, p.hp - 1)
                return {"success": False, "message": reason}

    # ── Apply damage ─────────────────────────────────────────────────────
    async with _db_lock:
        conn = get_connection()
        try:
            room = state.current_room
            row  = conn.execute(
                f"SELECT * FROM {room} WHERE id = ? AND alive = 1", (target_id,)
            ).fetchone()
            if not row:
                return {"success": False, "message": "Target not found or already deleted."}
            new_hp = row["hp"] - 2
            if new_hp <= 0:
                conn.execute(f"UPDATE {room} SET hp=0, alive=0 WHERE id=?", (target_id,))
                conn.commit()
                async with state.lock:
                    if target_id in state.enemies:
                        state.enemies[target_id].alive = False
                await state.add_score(player_id, 25)
                return {"success": True, "message": f"DELETE destroyed [{row['label']}]! +25 pts", "affected_id": target_id}
            else:
                conn.execute(f"UPDATE {room} SET hp=? WHERE id=?", (new_hp, target_id))
                conn.commit()
                async with state.lock:
                    if target_id in state.enemies:
                        state.enemies[target_id].hp = new_hp
                await state.add_score(player_id, 10)
                return {"success": True, "message": f"DELETE hit [{row['label']}] — {new_hp} HP left. +10 pts", "affected_id": target_id}
        finally:
            conn.close()


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

    # ── Room objective check ─────────────────────────────────────────────
    async with state.lock:
        enemy = state.enemies.get(target_id)
        if not enemy or not enemy.alive:
            return {"success": False, "message": "Target not found."}

        checker = ROOM_CHECKERS.get(state.room_number)
        if checker:
            valid, reason = checker(enemy.extra, "UPDATE")
            if not valid:
                p = state.players.get(player_id)
                if p:
                    p.hp = max(0, p.hp - 1)
                return {"success": False, "message": reason}

    async with _db_lock:
        conn = get_connection()
        try:
            room = state.current_room
            row  = conn.execute(
                f"SELECT * FROM {room} WHERE id = ? AND alive = 1", (target_id,)
            ).fetchone()
            if not row:
                return {"success": False, "message": "Target not found."}

            # Room 5 boss: advance from phase 2 → 3
            if state.room_number == 5:
                async with state.lock:
                    e = state.enemies.get(target_id)
                    if e and e.extra.get("phase") == 2:
                        e.extra["phase"] = 3
                        new_hp = max(1, row["hp"] // 3)
                        e.hp = new_hp
                        conn.execute(f"UPDATE {room} SET hp=?, phase=3 WHERE id=?", (new_hp, target_id))
                        conn.commit()
                        await state.add_score(player_id, 30)
                        return {"success": True, "message": f"UPDATE exploited weakness! Boss weakened to {new_hp} HP! Use DELETE to finish! +30 pts", "affected_id": target_id}

            # Normal UPDATE: halve HP (Room 3 objective etc.)
            new_hp = max(1, row["hp"] // 2)
            conn.execute(f"UPDATE {room} SET hp=? WHERE id=?", (new_hp, target_id))
            conn.commit()
            async with state.lock:
                if target_id in state.enemies:
                    state.enemies[target_id].hp = new_hp
            await state.add_score(player_id, 15)

            # Room 3: auto-kill when UPDATE reduces to 1 HP (objective complete for this enemy)
            if state.room_number == 3 and new_hp <= 1:
                conn2 = get_connection()
                conn2.execute(f"UPDATE {room} SET hp=0, alive=0 WHERE id=?", (target_id,))
                conn2.commit()
                conn2.close()
                async with state.lock:
                    if target_id in state.enemies:
                        state.enemies[target_id].alive = False
                        state.enemies[target_id].hp = 0
                return {"success": True, "message": f"UPDATE complete on [{row['label']}]! Record updated and cleared. +15 pts", "affected_id": target_id}

            return {"success": True, "message": f"UPDATE weakened [{row['label']}] to {new_hp} HP. +15 pts", "affected_id": target_id}
        finally:
            conn.close()


async def _spell_join() -> dict:
    conn = get_connection()
    try:
        alive = conn.execute(
            f"SELECT COUNT(*) as cnt FROM {state.current_room} WHERE alive = 1"
        ).fetchone()["cnt"]
        if alive > 0:
            return {"success": False, "message": f"JOIN failed — {alive} enemies still alive!"}
        conn.execute(
            "UPDATE rooms SET unlocked=1 WHERE id=(SELECT id FROM rooms WHERE unlocked=0 ORDER BY id ASC LIMIT 1)"
        )
        conn.commit()
        return {"success": True, "message": "JOIN successful — next room unlocked!"}
    finally:
        conn.close()