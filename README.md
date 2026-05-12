# Data Raiders

Data Raiders is a real-time multiplayer dungeon crawler where players use SQL-themed role abilities to clear rooms.

- Backend: FastAPI + WebSockets + SQLite
- Frontend: React + Vite + TypeScript + Canvas UI
- Core concept: team coordination through role-locked spells (`DELETE`, `INSERT/UPDATE`, `SELECT/JOIN`)

## Table of Contents

1. Overview
2. Tech Stack
3. Project Structure
4. Prerequisites
5. Installation
6. Running the Project
7. How Multiplayer Session Flow Works
8. Roles and Abilities
9. Lobby and Rejoin Rules
10. API and Socket Protocol
11. Configuration Notes
12. Troubleshooting
13. Development Notes

## 1. Overview

The server is authoritative: clients send intent (move, cast spell, query), and the server validates and applies all game logic.

Gameplay progresses across rooms with SQL-based objectives. Players must coordinate by role:

- `Archer`: target cleanup via `DELETE`
- `Swordsman`: data repair via `INSERT`/`UPDATE`
- `Wizard`: intel + progression via `SELECT`/`JOIN`

## 2. Tech Stack

### Backend

- Python 3.8+
- FastAPI
- Uvicorn
- WebSockets
- SQLite
- AsyncIO + event queue + lock-protected shared state

### Frontend

- Node.js 18+
- React 19
- TypeScript
- Vite
- Monaco Editor (SQL terminal)

## 3. Project Structure

```text
.
├── server/
│   ├── main.py          # FastAPI app, REST + WebSocket endpoints
│   ├── game_state.py    # Authoritative shared state + role transfer logic
│   ├── spell_engine.py  # Spell validation and room-specific SQL mechanics
│   ├── event_bus.py     # Async producer/consumer event broadcast queue
│   ├── room_manager.py  # Room orchestration helpers
│   └── db.py            # SQLite init/seed/load utilities
├── shared/
│   ├── constants.py     # Tick rate, map constants, gameplay constants
│   └── messages.py      # Shared message schema/constants
├── webclient/
│   ├── src/             # React UI, game canvas, lobby, terminal
│   └── package.json
├── runserver.py         # Uvicorn launcher
├── requirements.txt
└── README.md
```

## 4. Prerequisites

- Python 3.8 or newer
- Node.js 18 or newer
- npm

## 5. Installation

### Backend dependencies

```bash
pip install -r requirements.txt
```

### Frontend dependencies

```bash
cd webclient
npm install
```

## 6. Running the Project

### Step 1: Start backend server

From repo root:

```bash
python runserver.py
```

Server runs on port `8000`.

### Step 2: Start frontend

In another terminal:

```bash
cd webclient
npm run dev -- --host
```

- `--host` exposes Vite on LAN so other devices can connect.
- On another computer, use the host machine's current LAN IP + Vite port.

## 7. How Multiplayer Session Flow Works

1. Host opens lobby.
2. Players join lobby via WebSocket.
3. Host starts game (`start_game`).
4. State transitions from lobby to journey/play phases.
5. Server broadcasts snapshots at fixed tick rate.
6. When all players disconnect, lobby/game flags reset for a new session.

## 8. Roles and Abilities

Default role mapping:

- `Archer` -> `DELETE`
- `Swordsman` -> `INSERT`, `UPDATE`
- `Wizard` -> `SELECT`, `JOIN`

Notes:

- Query terminal execution is restricted to the current `Wizard` role holder.
- Spell availability is role-validated on the server.
- In Solo mode, one player gets all core roles.

## 9. Lobby and Rejoin Rules

Current enforced behavior:

- Cannot join if lobby is closed.
- Cannot join once game has started.
- Cannot reopen a lobby while an active game/session is in progress.
- If a player disconnects during gameplay, their role is transferred to exactly one remaining player (not all).
- If only one player remains, transferred roles accumulate on that last player.

## 10. API and Socket Protocol

### REST endpoints

- `GET /stats` -> live server metrics (`players_online`, queue stats, room info)
- `GET /lobby` -> lobby state (`open`, `started`, player list, roles)
- `POST /lobby/open` -> host opens lobby
- `POST /lobby/close` -> host closes lobby

### WebSocket

- Endpoint: `WS /ws`
- Initial client message must be `join`

Common client message types:

- `join`
- `move`
- `spell`
- `query`
- `chat`
- `change_role`
- `start_game`
- `reset`

Common server message types:

- `welcome`
- `player_joined` / `player_left`
- `spell_result`
- `query_result`
- `role_changed` / `role_error`
- `reset_ack`
- periodic state snapshots

## 11. Configuration Notes

- Backend port is currently `8000`.
- Frontend dev server defaults to `5173` unless occupied.
- LAN IP is environment-dependent and changes per machine/network.
- For production-style static serving, build webclient:

```bash
cd webclient
npm run build
```

When `webclient/dist` exists, backend serves it under `/client`.

## 12. Troubleshooting

### "The game has already started"

Expected when trying to join/reopen during an active session. Wait for a fresh lobby.

### Teammates cannot connect over LAN

- Ensure backend and frontend are running with reachable host/IP.
- Verify firewall allows ports `8000` and `5173` (or current Vite port).
- Confirm devices are on the same network/subnet.

### Role conflict on join

If chosen role is already taken, change role in lobby and retry.

### SQL terminal blocked

Only the current Wizard-role holder can run queries.

### Install/build issues

- Re-run `npm install` in `webclient/`
- Check Node version (`node -v`)
- Reinstall Python dependencies (`pip install -r requirements.txt`)

## 13. Development Notes

- Shared mutable state is guarded with `asyncio.Lock`.
- Event fan-out uses async queue consumer (`event_bus.py`).
- DB operations used in gameplay are validated in spell/query handlers.
- Avoid bypassing server validation from client-side changes.
