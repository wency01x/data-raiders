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
*Open the provided local URL in your browser to play the game.*

### 3. Start the Pygame Client (Optional)
If you prefer the original desktop client, from the root directory:
```bash
python client/main.py
```

## Features
- **SQL-Based Mechanics**: Dependency-based SQL deletion gameplay mechanics with HP penalties.
- **Real-Time Multiplayer**: Built on fast, reliable WebSockets and FastAPI to support live, connected gameplay.
- **Visual Fidelity**: Beautiful animated sprites and dynamic canvas elements in the React interface.
- **Cross-Platform Play**: Enjoy the game from either the desktop Pygame client or the modern React web client.
