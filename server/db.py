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
                "LEVEL 1 — THE CORRUPTION SPREADS\n"
                "Table: employees (id, name, status, dept)\n"
                "A digital plague is infecting our staff records!\n"
                "Identify the 'CORRUPTED' ones with SELECT, then purge them with DELETE!"
            ),
            # objective
            "Hunt down and eliminate all corrupted employee records before it's too late.",
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
                "LEVEL 2 — INFESTATION ALERT\n"
                "Table: employees_dept (id, name, dept, salary)\n"
                "The notorious BUGS department has breached sector 2!\n"
                "Show no mercy: DELETE every employee from the 'BUGS' department."
            ),
            "Clear out the entire BUGS department. Leave the good devs alone!",
            json.dumps({
                "table_name": "employees_dept",
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
                "LEVEL 3 — PAYDAY HEIST\n"
                "Table: employees_salary (id, name, role, salary)\n"
                "The Devs are staging a walkout! They demand better compensation.\n"
                "Use UPDATE to double the salary for everyone with role = 'Dev'."
            ),
            "Buff the Developers' salaries using the UPDATE spell to calm them down.",
            json.dumps({
                "table_name": "employees_salary",
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
                "LEVEL 4 — CHAIN OF COMMAND\n"
                "Table: employees_fk (id, name, manager_id)\n"
                "A hostile corporate takeover! manager_id relies on other IDs.\n"
                "You must overthrow the hierarchy from the bottom up! DELETE children before parents."
            ),
            "Dismantle the management chain systematically from the lowest tier to the CEO.",
            json.dumps({
                "table_name": "employees_fk",
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
                "LEVEL 5 — THE BIG EVIL DATA\n"
                "Table: sys_corrupted (id, name, weakness, phase)\n"
                "A massive, terrifying anomaly has formed! You need teamwork to survive!\n"
                "Phase 1: SELECT it to expose weakness. Phase 2: UPDATE to exploit it.\n"
                "Phase 3: Spam DELETE with your team to bring its huge HP down!"
            ),
            "Work together with your teammates to defeat the massive boss anomaly.",
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
            ("Leo",    6, 6,  4,  3, "Leo",    "Dev",     50000),
            ("Mia",    6, 6,  9,  2, "Mia",    "QA",      55000),
            ("Nick",   6, 6, 13,  5, "Nick",   "Dev",     48000),
            ("Olivia", 6, 6,  3,  8, "Olivia", "Manager", 95000),
            ("Paul",   6, 6,  8,  9, "Paul",   "Dev",     52000),
        ],
    )

    # ── Seed enemies_room4 — FK constraints ──────────────────────────────
    # Chain: Worker(4) → TeamLead(3) → Manager(2) → CEO(1)
    # Plus one standalone
    c.executemany(
        "INSERT INTO enemies_room4 (label, hp, max_hp, tile_x, tile_y, name, manager_id) VALUES (?,?,?,?,?,?,?)",
        [
            ("CEO",      7, 7,  3,  3, "CEO",      0),    # id=1, no manager
            ("Manager",  7, 7,  8,  2, "Manager",  1),    # id=2, reports to CEO
            ("TeamLead", 7, 7, 12,  6, "TeamLead", 2),    # id=3, reports to Manager
            ("Worker",   5, 5,  6,  9, "Worker",   3),    # id=4, reports to TeamLead
            ("Intern",   5, 5, 13,  9, "Intern",   0),    # id=5, standalone
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
            ("CORRUPT_INDEX", 100, 100, 7, 5, "CORRUPT_INDEX", "REINDEX", 1),
        ],
    )

    # ── seed loot per room ───────────────────────────────────────────────
    c.executemany(
        "INSERT INTO loot (room_id, tile_x, tile_y, value, label) VALUES (?,?,?,?,?)",
        [
            (1,  2,  6, 10, "ROW_ID"),
            (1, 14,  3, 10, "STATUS"),
            (1,  8,  5,  0, "health"),
            (2,  1,  8, 15, "DEPT"),
            (2, 14,  4, 15, "SALARY"),
            (2,  7,  7,  0, "health"),
            (3,  2,  5, 20, "ROLE"),
            (3, 13,  8, 20, "BONUS"),
            (3,  5,  5,  0, "health"),
            (4,  7,  5, 25, "FK_KEY"),
            (4, 10,  2,  0, "health"),
            (5, 12,  3, 30, "INDEX"),
            (5,  3, 10, 30, "SCHEMA"),
            (5,  2,  2,  0, "health"),
            (5, 13, 10,  0, "health"),
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