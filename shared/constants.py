SERVER_HOST = "localhost"
SERVER_PORT = 8000
WS_URL      = f"ws://{SERVER_HOST}:{SERVER_PORT}/ws"

TILE_SIZE    = 56          # was 40 — bigger tiles = more readable
MAP_COLS     = 16          # was 20
MAP_ROWS     = 12          # was 15
PLAYER_SPEED = 5
TICK_RATE    = 60

PLAYER_COLORS = {
    0: (88,  166, 255),
    1: (188, 140, 255),
    2: (63,  185,  80),
    3: (240, 136,  62),
}

TILE_FLOOR = 0
TILE_WALL  = 1
TILE_DOOR  = 2
TILE_LOOT  = 3

SPELL_SELECT = "SELECT"
SPELL_DELETE = "DELETE"
SPELL_INSERT = "INSERT"
SPELL_UPDATE = "UPDATE"
SPELL_JOIN   = "JOIN"