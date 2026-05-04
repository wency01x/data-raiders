# Data Raiders

Data Raiders is an interactive dungeon crawler where players navigate challenges using a robust dependency-based SQL deletion mechanic with HP penalties to overcome obstacles and enemies. The game features a real-time multiplayer backend, a classic Pygame client, and a modern, high-fidelity React web interface.

*Note: This is a Parallel Distributed Computing project FINAL PIT for its course.*

## Project Structure

- **`server/`**: The backend server, built with FastAPI and WebSockets. It handles the authoritative game state (`game_state.py`), SQLite database interactions (`db.py`, `dungeon.db`), spell mechanics (`spell_engine.py`), and real-time events (`event_bus.py`).
- **`client/`**: A classic Pygame-based desktop client for playing the game locally.
- **`webclient/`**: A modern web client built with React, Vite, and TailwindCSS. It features responsive canvas rendering, animated character sprites, and a sleek user interface.
- **`shared/`**: Shared constants (`constants.py`) and message definitions (`messages.py`) used for communication between the clients and the backend over WebSockets.

## Requirements

### Server & Pygame Client
- Python 3.8+
Ensure your virtual environment is active, then install dependencies:
```bash
pip install -r requirements.txt
```

### Web Client
- Node.js & npm (v18+)
```bash
cd webclient
npm install
```

## Running the Application

### 1. Start the Backend Server
From the root directory:
```bash
python runserver.py
```
*The server will start on `ws://0.0.0.0:8000` via Uvicorn.*

### 2. Start the Web Client
In a separate terminal, navigate to the `webclient/` directory and start the Vite development server:
```bash
cd webclient
npm run dev
```

## Features
- **SQL-Based Mechanics**: Dependency-based SQL deletion gameplay mechanics with HP penalties.
- **Real-Time Multiplayer**: Built on fast, reliable WebSockets and FastAPI to support live, connected gameplay.
- **Visual Fidelity**: Beautiful animated sprites and dynamic canvas elements in the react interface.
- **Cross-Platform Play**: Enjoy the game from either the desktop Pygame client or the modern React web client.

## Multiplayer Game System Implementation Details

This project is aligned with the **Option A - Multiplayer Game System** rubric.

### 1. Minimum System Requirements

*   **At least 2-4 concurrent players:** The server uses FastAPI's WebSocket endpoints (`@app.websocket("/ws")` in `server/main.py`) to manage multiple concurrent connections. The frontend lobby natively supports multiple players joining the same instance, assigning each a unique UUID and color.
*   **Real-time state synchronization (Position, Actions, Events):** The server runs a dedicated background task called `_game_tick_loop()`. This loop runs at a consistent `TICK_RATE` (e.g., 20 times a second) and broadcasts a complete snapshot of all player positions, HP, and enemy statuses to every connected client. Fast-paced actions like walking and taking damage are immediately synced.
*   **Server-authoritative Architecture:** Clients never trust their own state. When a user presses "W" to move or casts a spell, the client merely sends an *intent* to the server (`{"type": "move", "dx": 0, "dy": -1}`). The server calculates the logic, checks bounds, and verifies database rules (in `spell_engine.py`), and then the server updates the master state.
*   **Concurrency or parallelism used in Request Handling, Updates, and Events:** 
    *   *Requests:* Each player's WebSocket connection is an independent, concurrent `asyncio` coroutine.
    *   *State updates:* The `_game_tick_loop()` runs concurrently alongside the player connections.
    *   *Events:* Chat messages and spell effects use a producer-consumer event queue to decouple them from the main tick loop.

### 2. Parallel/Distributed Concepts Demonstrated

*   **Multithreading or multiprocessing for game logic:**
    *   *Where it is:* Look at `server/spell_engine.py` and the `_run_in_thread()` function.
    *   *How it works:* Python's `asyncio` is single-threaded. Because SQLite database queries are synchronous, a complex `SELECT` or `UPDATE` would freeze the entire server, causing other players to lag. To solve this, the game offloads every database query to a background **ThreadPoolExecutor** using `loop.run_in_executor()`. This is a textbook demonstration of mixing asynchronous I/O with multithreading.
*   **Network communication (sockets, async I/O, RPC):**
    *   *Where it is:* The `WebSocket` connections in `App.tsx` and `server/main.py`.
    *   *How it works:* The game uses bi-directional async WebSockets for low-latency game state streaming, and standard HTTP polling for the `/stats` live dashboard.
*   **Shared state management or message passing:**
    *   *Where it is:* `server/game_state.py` and `server/event_bus.py`.
    *   *How it works:* The `state` object is shared memory that all concurrent WebSocket connections read from and write to. For non-state events (like "Player X joined" or a Chat message), you use **Message Passing** via an `asyncio.Queue` where endpoints act as *producers* and a background task acts as a *consumer* that broadcasts the messages.
*   **Synchronization mechanisms (locks, queues, async loops):**
    *   *Where it is:* Throughout the backend.
    *   *How it works:* 
        *   **Locks:** Because multiple players might attack the same enemy at the exact same millisecond, you use `async with state.lock:` (an `asyncio.Lock()`) to prevent race conditions that could cause negative HP or duplicated points.
        *   **Queues:** The `event_bus.py` uses an `asyncio.Queue` to safely buffer bursts of network events.
        *   **Async loops:** The infinite `while True:` loop in `_game_tick_loop()` acts as your distributed clock/tick generator.
