import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), "dungeon.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    c = conn.cursor()

    # ── rooms table ──────────────────────────────────────────────────────
    c.execute("DROP TABLE IF EXISTS rooms")
    c.execute("""
        CREATE TABLE rooms (
            id            INTEGER PRIMARY KEY,
            name          TEXT NOT NULL,
            table_ref     TEXT NOT NULL,
            unlocked      INTEGER DEFAULT 0,
            brief         TEXT DEFAULT '',
            objective     TEXT DEFAULT '',
            schema_info   TEXT DEFAULT '{}',
            hint          TEXT DEFAULT '',
            allowed_spells TEXT DEFAULT 'SELECT,DELETE,UPDATE,INSERT,JOIN'
        )
    """)

    # ── enemy tables for each room ───────────────────────────────────────
    for i in range(1, 6):
        c.execute(f"DROP TABLE IF EXISTS enemies_room{i}")

    # Room 1: SELECT Basics — identify corrupted records
    c.execute("""
        CREATE TABLE enemies_room1 (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            label      TEXT NOT NULL,
            hp         INTEGER DEFAULT 2,
            max_hp     INTEGER DEFAULT 2,
            tile_x     INTEGER,
            tile_y     INTEGER,
            alive      INTEGER DEFAULT 1,
            depends_on TEXT DEFAULT '',
            name       TEXT DEFAULT '',
            status     TEXT DEFAULT 'OK',
            dept       TEXT DEFAULT ''
        )
    """)

    # Room 2: DELETE WHERE — remove employees from BUGS department
    c.execute("""
        CREATE TABLE enemies_room2 (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            label      TEXT NOT NULL,
            hp         INTEGER DEFAULT 3,
            max_hp     INTEGER DEFAULT 3,
            tile_x     INTEGER,
            tile_y     INTEGER,
            alive      INTEGER DEFAULT 1,
            depends_on TEXT DEFAULT '',
            name       TEXT DEFAULT '',
            dept       TEXT DEFAULT '',
            salary     INTEGER DEFAULT 0
        )
    """)

    # Room 3: UPDATE SET — update salary for Devs
    c.execute("""
        CREATE TABLE enemies_room3 (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            label      TEXT NOT NULL,
            hp         INTEGER DEFAULT 4,
            max_hp     INTEGER DEFAULT 4,
            tile_x     INTEGER,
            tile_y     INTEGER,
            alive      INTEGER DEFAULT 1,
            depends_on TEXT DEFAULT '',
            name       TEXT DEFAULT '',
            role       TEXT DEFAULT '',
            salary     INTEGER DEFAULT 0
        )
    """)

    # Room 4: DELETE + FK constraints — dependency chain
    c.execute("""
        CREATE TABLE enemies_room4 (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            label      TEXT NOT NULL,
            hp         INTEGER DEFAULT 4,
            max_hp     INTEGER DEFAULT 4,
            tile_x     INTEGER,
            tile_y     INTEGER,
            alive      INTEGER DEFAULT 1,
            depends_on TEXT DEFAULT '',
            name       TEXT DEFAULT '',
            manager_id INTEGER DEFAULT 0
        )
    """)

    # Room 5: JOIN Boss — multi-phase
    c.execute("""
        CREATE TABLE enemies_room5 (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            label      TEXT NOT NULL,
            hp         INTEGER DEFAULT 10,
            max_hp     INTEGER DEFAULT 10,
            tile_x     INTEGER,
            tile_y     INTEGER,
            alive      INTEGER DEFAULT 1,
            depends_on TEXT DEFAULT '',
            name       TEXT DEFAULT '',
            weakness   TEXT DEFAULT '',
            phase      INTEGER DEFAULT 1
        )
    """)

    # ── loot ─────────────────────────────────────────────────────────────
    c.execute("DROP TABLE IF EXISTS loot")
    c.execute("""
        CREATE TABLE loot (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id   INTEGER,
            tile_x    INTEGER,
            tile_y    INTEGER,
            value     INTEGER DEFAULT 10,
            label     TEXT DEFAULT 'data',
            collected INTEGER DEFAULT 0
        )
    """)

    # ══════════════════════════════════════════════════════════════════════
    # SEED DATA
    # ══════════════════════════════════════════════════════════════════════

    # ── Room definitions ─────────────────────────────────────────────────
    rooms_data = [
        (
            1, "employees_status", "enemies_room1", 1,
            # brief
            (
                "ROOM 1 — SELECT RECON\n"
                "Table: employees (id, name, status, dept)\n"
                "Some records are CORRUPTED.\n"
                "Use SELECT to identify them, then DELETE only the corrupted ones!"
            ),
            # objective
            "DELETE all rows WHERE status = 'CORRUPTED'",
            # schema_info
            json.dumps({
                "table_name": "employees",
                "columns": ["id", "name", "status", "dept"],
                "sample_data": [
                    [1, "Alice", "OK", "Engineering"],
                    [2, "Bob", "CORRUPTED", "Sales"],
                ]
            }),
            # hint
            "TIP: Use SELECT on each enemy first to discover which ones are CORRUPTED!",
            # allowed_spells
            "SELECT,DELETE"
        ),
        (
            2, "employees_dept", "enemies_room2", 0,
            (
                "ROOM 2 — DELETE WHERE\n"
                "Table: employees (id, name, dept, salary)\n"
                "The BUGS department is infesting the database!\n"
                "DELETE only employees from the 'BUGS' department."
            ),
            "DELETE all rows WHERE dept = 'BUGS'",
            json.dumps({
                "table_name": "employees",
                "columns": ["id", "name", "dept", "salary"],
                "sample_data": [
                    [1, "Carol", "BUGS", 40000],
                    [2, "Dave", "Engineering", 75000],
                ]
            }),
            "TIP: Don't delete the good employees! Only target dept = 'BUGS'.",
            "SELECT,DELETE"
        ),
        (
            3, "employees_salary", "enemies_room3", 0,
            (
                "ROOM 3 — UPDATE SET\n"
                "Table: employees (id, name, role, salary)\n"
                "The Devs are underpaid! Their salary should be doubled.\n"
                "Use UPDATE on employees WHERE role = 'Dev'."
            ),
            "UPDATE salary (use UPDATE spell) on rows WHERE role = 'Dev'",
            json.dumps({
                "table_name": "employees",
                "columns": ["id", "name", "role", "salary"],
                "sample_data": [
                    [1, "Eve", "Dev", 50000],
                    [2, "Frank", "QA", 55000],
                ]
            }),
            "TIP: UPDATE only affects the target's HP. Use it on the right employees!",
            "SELECT,UPDATE"
        ),
        (
            4, "employees_fk", "enemies_room4", 0,
            (
                "ROOM 4 — FK CONSTRAINTS\n"
                "Table: employees (id, name, manager_id)\n"
                "manager_id references another employee's id.\n"
                "You must DELETE child rows BEFORE parent rows!\n"
                "Delete in the correct order or suffer HP penalties."
            ),
            "DELETE all rows respecting FK constraints (children before parents)",
            json.dumps({
                "table_name": "employees",
                "columns": ["id", "name", "manager_id"],
                "sample_data": [
                    [1, "CEO", "NULL"],
                    [2, "Manager", 1],
                    [3, "Worker", 2],
                ]
            }),
            "TIP: Query to find who reports to whom. Delete from bottom up!",
            "SELECT,DELETE"
        ),
        (
            5, "sys_boss", "enemies_room5", 0,
            (
                "ROOM 5 — FINAL BOSS\n"
                "Table: sys_corrupted (id, name, weakness, phase)\n"
                "The CORRUPT_INDEX boss has multiple phases!\n"
                "Phase 1: Use SELECT to find its weakness.\n"
                "Phase 2: Use UPDATE to exploit the weakness.\n"
                "Phase 3: Use DELETE to finish it off!"
            ),
            "SELECT to find weakness → UPDATE to weaken → DELETE to destroy",
            json.dumps({
                "table_name": "sys_corrupted",
                "columns": ["id", "name", "weakness", "phase"],
                "sample_data": [
                    [1, "CORRUPT_INDEX", "???", 1],
                ]
            }),
            "TIP: Each phase requires a different spell. Follow the order!",
            "SELECT,UPDATE,DELETE"
        ),
    ]

    c.executemany(
        "INSERT INTO rooms (id, name, table_ref, unlocked, brief, objective, schema_info, hint, allowed_spells)"
        " VALUES (?,?,?,?,?,?,?,?,?)",
        rooms_data,
    )

    # ── Seed enemies_room1 — SELECT recon ────────────────────────────────
    c.executemany(
        "INSERT INTO enemies_room1 (label, hp, max_hp, tile_x, tile_y, name, status, dept) VALUES (?,?,?,?,?,?,?,?)",
        [
            ("Alice",   2, 2,  3,  3, "Alice",   "OK",        "Engineering"),
            ("Bob",     2, 2,  7,  2, "Bob",     "CORRUPTED", "Sales"),
            ("Carol",   2, 2, 11,  5, "Carol",   "CORRUPTED", "Marketing"),
            ("Dave",    2, 2,  5,  8, "Dave",    "OK",        "Engineering"),
            ("Eve",     2, 2, 13,  9, "Eve",     "CORRUPTED", "HR"),
        ],
    )

    # ── Seed enemies_room2 — DELETE WHERE dept='BUGS' ────────────────────
    c.executemany(
        "INSERT INTO enemies_room2 (label, hp, max_hp, tile_x, tile_y, name, dept, salary) VALUES (?,?,?,?,?,?,?,?)",
        [
            ("Frank",  3, 3,  3,  3, "Frank",  "BUGS",        35000),
            ("Grace",  3, 3,  8,  2, "Grace",  "Engineering",  80000),
            ("Hank",   3, 3, 12,  6, "Hank",   "BUGS",        42000),
            ("Ivy",    3, 3,  5,  9, "Ivy",    "Design",       60000),
            ("Jack",   3, 3, 10,  8, "Jack",   "BUGS",        38000),
            ("Kim",    3, 3,  2,  6, "Kim",    "Engineering",  90000),
        ],
    )

    # ── Seed enemies_room3 — UPDATE WHERE role='Dev' ─────────────────────
    c.executemany(
        "INSERT INTO enemies_room3 (label, hp, max_hp, tile_x, tile_y, name, role, salary) VALUES (?,?,?,?,?,?,?,?)",
        [
            ("Leo",    4, 4,  4,  3, "Leo",    "Dev",     50000),
            ("Mia",    4, 4,  9,  2, "Mia",    "QA",      55000),
            ("Nick",   4, 4, 13,  5, "Nick",   "Dev",     48000),
            ("Olivia", 4, 4,  3,  8, "Olivia", "Manager", 95000),
            ("Paul",   4, 4,  8,  9, "Paul",   "Dev",     52000),
        ],
    )

    # ── Seed enemies_room4 — FK constraints ──────────────────────────────
    # Chain: Worker(4) → TeamLead(3) → Manager(2) → CEO(1)
    # Plus one standalone
    c.executemany(
        "INSERT INTO enemies_room4 (label, hp, max_hp, tile_x, tile_y, name, manager_id) VALUES (?,?,?,?,?,?,?)",
        [
            ("CEO",      4, 4,  3,  3, "CEO",      0),    # id=1, no manager
            ("Manager",  4, 4,  8,  2, "Manager",  1),    # id=2, reports to CEO
            ("TeamLead", 4, 4, 12,  6, "TeamLead", 2),    # id=3, reports to Manager
            ("Worker",   3, 3,  6,  9, "Worker",   3),    # id=4, reports to TeamLead
            ("Intern",   3, 3, 13,  9, "Intern",   0),    # id=5, standalone
        ],
    )
    # Set FK dependencies: parent is blocked until children are deleted
    c.execute("UPDATE enemies_room4 SET depends_on='2' WHERE id=1")   # CEO blocked by Manager
    c.execute("UPDATE enemies_room4 SET depends_on='3' WHERE id=2")   # Manager blocked by TeamLead
    c.execute("UPDATE enemies_room4 SET depends_on='4' WHERE id=3")   # TeamLead blocked by Worker

    # ── Seed enemies_room5 — Boss ────────────────────────────────────────
    c.executemany(
        "INSERT INTO enemies_room5 (label, hp, max_hp, tile_x, tile_y, name, weakness, phase) VALUES (?,?,?,?,?,?,?,?)",
        [
            ("CORRUPT_INDEX", 12, 12, 7, 5, "CORRUPT_INDEX", "REINDEX", 1),
        ],
    )

    # ── seed loot per room ───────────────────────────────────────────────
    c.executemany(
        "INSERT INTO loot (room_id, tile_x, tile_y, value, label) VALUES (?,?,?,?,?)",
        [
            (1,  2,  6, 10, "ROW_ID"),
            (1, 14,  3, 10, "STATUS"),
            (2,  1,  8, 15, "DEPT"),
            (2, 14,  4, 15, "SALARY"),
            (3,  2,  5, 20, "ROLE"),
            (3, 13,  8, 20, "BONUS"),
            (4,  7,  5, 25, "FK_KEY"),
            (5, 12,  3, 30, "INDEX"),
            (5,  3, 10, 30, "SCHEMA"),
        ],
    )

    # ── SQL views so players can query with friendly names ──────────────
    # These let users type "SELECT * FROM employees" in the SQL terminal
    c.execute("DROP VIEW IF EXISTS employees")
    c.execute("DROP VIEW IF EXISTS employees_status")
    c.execute("DROP VIEW IF EXISTS employees_dept")
    c.execute("DROP VIEW IF EXISTS employees_salary")
    c.execute("DROP VIEW IF EXISTS employees_fk")
    c.execute("DROP VIEW IF EXISTS sys_corrupted")

    c.execute("""
        CREATE VIEW employees AS
        SELECT id, name, status, dept FROM enemies_room1 WHERE alive=1
    """)
    c.execute("""
        CREATE VIEW employees_dept AS
        SELECT id, name, dept, salary FROM enemies_room2 WHERE alive=1
    """)
    c.execute("""
        CREATE VIEW employees_salary AS
        SELECT id, name, role, salary FROM enemies_room3 WHERE alive=1
    """)
    c.execute("""
        CREATE VIEW employees_fk AS
        SELECT id, name, manager_id FROM enemies_room4 WHERE alive=1
    """)
    c.execute("""
        CREATE VIEW sys_corrupted AS
        SELECT id, name, weakness, phase FROM enemies_room5 WHERE alive=1
    """)

    conn.commit()
    conn.close()
    print("[DB] Dungeon database initialized with 5 challenge rooms.")