import asyncio
import uuid
from dataclasses import dataclass, field
from shared.constants import PLAYER_COLORS, MAP_COLS, MAP_ROWS, TILE_SIZE, PLAYER_SPEED


@dataclass
class Player:
    id: str
    name: str
    x: float
    y: float
    hp: int = 5
    max_hp: int = 5
    color_idx: int = 0
    score: int = 0

    def to_dict(self):
        return {
            "id": self.id, "name": self.name,
            "x": self.x,  "y": self.y,
            "hp": self.hp, "max_hp": self.max_hp,
            "color_idx": self.color_idx, "score": self.score,
        }


@dataclass
class Enemy:
    id: int
    label: str
    hp: int
    max_hp: int
    tile_x: int
    tile_y: int
    alive: bool = True
    depends_on: list = None
    # Extra row data for display
    extra: dict = field(default_factory=dict)

    def __post_init__(self):
        if self.depends_on is None:
            self.depends_on = []

    is_target: bool = True

    def to_dict(self):
        d = {
            "id": self.id, "label": self.label,
            "hp": self.hp, "max_hp": self.max_hp,
            "x": self.tile_x * TILE_SIZE,
            "y": self.tile_y * TILE_SIZE,
            "alive": self.alive,
            "depends_on": self.depends_on,
            "is_target": self.is_target,
        }
        d.update(self.extra)
        return d


@dataclass
class Loot:
    id: int
    tile_x: int
    tile_y: int
    value: int
    label: str = "data"
    collected: bool = False

    def to_dict(self):
        return {
            "id": self.id,
            "x": self.tile_x * TILE_SIZE,
            "y": self.tile_y * TILE_SIZE,
            "label": self.label,
            "collected": self.collected,
        }


class GameState:
    def __init__(self):
        self.lock = asyncio.Lock()
        self.players: dict[str, Player] = {}
        self.enemies: dict[int, Enemy]  = {}
        self.loot:    dict[int, Loot]   = {}
        self.current_room: str = "enemies_room1"
        self.room_brief:   str = ""
        self.room_objective: str = ""
        self.room_schema:    str = "{}"
        self.room_hint:      str = ""
        self.room_number:    int = 1
        self.allowed_spells: list[str] = ["SELECT", "DELETE"]
        self._color_counter = 0

    def next_color_idx(self) -> int:
        idx = self._color_counter % len(PLAYER_COLORS)
        self._color_counter += 1
        return idx

    async def add_player(self, name: str) -> Player:
        async with self.lock:
            pid   = str(uuid.uuid4())[:8]
            color = self.next_color_idx()
            spawn_x = (len(self.players) + 1) * 2 * TILE_SIZE
            p = Player(id=pid, name=name,
                       x=float(spawn_x), y=float(2 * TILE_SIZE),
                       color_idx=color)
            self.players[pid] = p
            return p

    async def remove_player(self, player_id: str):
        async with self.lock:
            self.players.pop(player_id, None)

    async def move_player(self, player_id: str, dx: float, dy: float):
        async with self.lock:
            p = self.players.get(player_id)
            if not p:
                return
            new_x = p.x + dx * PLAYER_SPEED
            new_y = p.y + dy * PLAYER_SPEED
            p.x = max(0.0, min(new_x, float((MAP_COLS - 1) * TILE_SIZE)))
            p.y = max(0.0, min(new_y, float((MAP_ROWS - 1) * TILE_SIZE)))

    def load_enemies(self, rows, extra_cols=None):
        """Load enemies from DB rows. extra_cols lists column names beyond the standard ones."""
        self.enemies.clear()
        standard = {"id", "label", "hp", "max_hp", "tile_x", "tile_y", "alive", "depends_on"}
        for row in rows:
            raw_dep = row["depends_on"] or ""
            dep_ids = [int(x) for x in raw_dep.split(",") if x.strip().isdigit()]
            extra = {}
            if extra_cols:
                for col in extra_cols:
                    if col in row.keys():
                        extra[col] = row[col]
            else:
                for col in row.keys():
                    if col not in standard:
                        extra[col] = row[col]
            e = Enemy(id=row["id"], label=row["label"],
                      hp=row["hp"], max_hp=row["max_hp"],
                      tile_x=row["tile_x"], tile_y=row["tile_y"],
                      alive=bool(row["alive"]),
                      depends_on=dep_ids,
                      extra=extra)
            # Determine if this enemy is a target based on room rules
            rn = self.room_number
            if rn == 1:
                e.is_target = extra.get("status") == "CORRUPTED"
            elif rn == 2:
                e.is_target = extra.get("dept") == "BUGS"
            elif rn == 3:
                e.is_target = extra.get("role") == "Dev"
            else:
                e.is_target = True  # rooms 4 & 5: all enemies are targets
            self.enemies[e.id] = e

    def load_loot(self, rows):
        self.loot.clear()
        for row in rows:
            l = Loot(id=row["id"], tile_x=row["tile_x"],
                     tile_y=row["tile_y"], value=row["value"],
                     label=row["label"] if "label" in row.keys() else "data",
                     collected=bool(row["collected"]))
            self.loot[l.id] = l

    def load_room_info(self, room_row):
        """Load room metadata from a rooms table row."""
        self.room_brief     = room_row["brief"] if room_row else ""
        self.room_objective = room_row["objective"] if room_row else ""
        self.room_schema    = room_row["schema_info"] if room_row else "{}"
        self.room_hint      = room_row["hint"] if room_row else ""
        self.room_number    = room_row["id"] if room_row else 1
        spells_str = room_row["allowed_spells"] if room_row else "SELECT,DELETE"
        self.allowed_spells = [s.strip() for s in spells_str.split(",")]

    async def damage_player(self, player_id: str, amount: int = 1) -> bool:
        """Returns True if this damage killed the player (hp just hit 0)."""
        async with self.lock:
            p = self.players.get(player_id)
            if not p:
                return False
            was_alive = p.hp > 0
            p.hp = max(0, p.hp - amount)
            return was_alive and p.hp == 0

    async def respawn_player(self, player_id: str):
        """Reset a dead player's HP and move them back to a safe spawn position."""
        async with self.lock:
            p = self.players.get(player_id)
            if p:
                p.hp = p.max_hp
                idx = list(self.players.keys()).index(player_id)
                p.x = float((idx + 1) * 2 * TILE_SIZE)
                p.y = float(2 * TILE_SIZE)

    async def add_score(self, player_id: str, amount: int = 10):
        async with self.lock:
            p = self.players.get(player_id)
            if p:
                p.score += amount

    def snapshot(self) -> dict:
        return {
            "type":       "state",
            "players":    [p.to_dict() for p in self.players.values()],
            "enemies":    [e.to_dict() for e in self.enemies.values() if e.alive],
            "loot":       [l.to_dict() for l in self.loot.values()],
            "room":       self.current_room,
            "room_number": self.room_number,
            "brief":      self.room_brief,
            "objective":  self.room_objective,
            "schema_info": self.room_schema,
            "hint":       self.room_hint,
            "allowed_spells": self.allowed_spells,
            "room_cleared":   self.is_room_cleared(),
            "targets_remaining": self.targets_remaining,
        }

    @property
    def targets_remaining(self) -> int:
        count = 0
        for e in self.enemies.values():
            if not e.alive:
                continue
            if self.room_number == 1 and e.extra.get("status") == "CORRUPTED":
                count += 1
            elif self.room_number == 2 and e.extra.get("dept") == "BUGS":
                count += 1
            elif self.room_number == 3 and e.extra.get("role") == "Dev":
                count += 1
            elif self.room_number in (4, 5):
                count += 1
        return count

    def is_room_cleared(self) -> bool:
        return self.targets_remaining == 0


state = GameState()