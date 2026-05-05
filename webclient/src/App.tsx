import { useEffect, useState, useRef } from "react";
import GameCanvas from "./GameCanvas";
import "./index.css";

export default function App() {
  type ViewState = 'TITLE' | 'LOADING' | 'GAME';
  const [view, setView] = useState<ViewState>('TITLE');
  const [showSettings, setShowSettings] = useState(false);
  const [showLobby, setShowLobby] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [useCRT, setUseCRT] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  
  const [messages, setMessages] = useState<string[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [sqlInput, setSqlInput] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [onlineCount, setOnlineCount] = useState(1);
  const [serverStats, setServerStats] = useState<any>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [attacks, setAttacks] = useState<Record<string, number>>({});
  const [playerName, setPlayerName] = useState(
    () => "Player_" + Math.floor(Math.random() * 100)
  );
  const [playerClass, setPlayerClass] = useState("Archer");
  const [gameMode, setGameMode] = useState("Standard");
  const [speedrunStart, setSpeedrunStart] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const myIdRef = useRef<string | null>(null);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (view !== 'GAME') return;
    const loc = window.location;
    const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${loc.hostname}:8000/ws`;
    const socket = new WebSocket(url);

    socket.onopen = () => {
      setWs(socket);
      socket.send(JSON.stringify({ type: "join", player_name: `${playerName}|${playerClass}` }));
      if (gameMode === 'Speedrun') setSpeedrunStart(Date.now());
    };

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "welcome":
          setMyId(msg.player_id);
          break;
        case "state":
          setGameState(msg);
          setOnlineCount(msg.players?.length ?? 1);
          break;
        case "player_joined":
          setMessages((m) => [...m, `⚡ ${msg.player_name.split('|')[0]} joined!`]);
          break;
        case "player_left":
          setMessages((m) => [...m, `👋 Player ${(msg.player_id || "?").slice(0, 4)} left.`]);
          break;
        case "chat":
          setMessages((m) => [...m, `${msg.sender.split('|')[0]}: ${msg.text}`]);
          break;
        case "reset_ack":
          setMessages((m) => [...m, `⟳ ${msg.message}`]);
          break;
        case "spell_result":
          setMessages((m) => [...m, `${msg.success ? "✅" : "❌"} ${msg.message}`]);
          if (msg.success) {
            setAttacks((a) => ({ ...a, [msg.player_id]: Date.now() }));
          }
          break;
        case "spell_cast":
          if (msg.player_id !== myIdRef.current) {
            setMessages((m) => [...m, `⚔ ${(msg.player_id || "?").slice(0, 4)} cast ${msg.spell}`]);
            setAttacks((a) => ({ ...a, [msg.player_id]: Date.now() }));
          }
          break;
        case "query_result":
          setQueryResult(msg);
          if (msg.success) {
            setMessages((m) => [...m, `📊 ${msg.message}`]);
          } else {
            setMessages((m) => [...m, `❌ ${msg.message}`]);
          }
          break;
      }
    };

    socket.onclose = () => setWs(null);
    return () => { socket.close(); };
  }, [playerName, playerClass, view, gameMode]);

  useEffect(() => {
    if (view !== 'GAME') return;
    const pollStats = async () => {
      try {
        const loc = window.location;
        const protocol = loc.protocol === "https:" ? "https:" : "http:";
        const url = `${protocol}//${loc.hostname}:8000/stats`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setServerStats(data);
        }
      } catch (err) {
        // silently fail if server is down or unreachable
      }
    };
    pollStats();
    const iv = setInterval(pollStats, 2000);
    return () => clearInterval(iv);
  }, [view]);

  useEffect(() => {
    if (view === 'GAME' && gameMode === 'Speedrun' && speedrunStart) {
      const iv = setInterval(() => {
        setElapsedTime(Date.now() - speedrunStart);
      }, 100);
      return () => clearInterval(iv);
    }
  }, [view, gameMode, speedrunStart]);

  // Poll /stats endpoint for Server Stats widget
  useEffect(() => {
    if (view !== 'GAME') return;
    const loc = window.location;
    const statsUrl = `${loc.protocol}//${loc.hostname}:8000/stats`;
    const fetchStats = () => {
      fetch(statsUrl)
        .then(r => r.json())
        .then(setServerStats)
        .catch(() => {});
    };
    fetchStats();
    const iv = setInterval(fetchStats, 2000);
    return () => clearInterval(iv);
  }, [view]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const msParts = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${msParts.toString().padStart(2, '0')}`;
  };

  const sendChat = () => {
    if (!inputVal.trim() || !ws) return;
    ws.send(JSON.stringify({ type: "chat", text: inputVal, sender: `${playerName}|${playerClass}` }));
    setMessages((m) => [...m, `You: ${inputVal}`]);
    setInputVal("");
  };

  const sendQuery = () => {
    if (!sqlInput.trim() || !ws) return;
    ws.send(JSON.stringify({ type: "query", sql: sqlInput }));
    setMessages((m) => [...m, `🔍 > ${sqlInput}`]);
    setSqlInput("");
  };

  const roomName = gameState?.room ?? "—";
  const roomNum = gameState?.room_number ?? 1;
  const brief = gameState?.brief ?? "";
  const objective = gameState?.objective ?? "";
  const hint = gameState?.hint ?? "";
  const allowedSpells = gameState?.allowed_spells ?? [];
  const enemies = gameState?.enemies?.filter((e: any) => e.alive) ?? [];
  const me = gameState?.players?.find((p: any) => p.id === myId);

  let schemaInfo: any = {};
  try {
    schemaInfo = JSON.parse(gameState?.schema_info ?? "{}");
  } catch { schemaInfo = {}; }

  useEffect(() => {
    setQueryResult(null);
  }, [roomNum]);

  useEffect(() => {
    if (view === 'GAME') {
      setTutorialStep(1);
    }
  }, [view]);

  if (view === 'TITLE') {
    return (
      <div className={`h-full w-full bg-scrolling-grid flex flex-col items-center justify-center font-sans relative overflow-hidden ${useCRT ? 'crt' : ''}`}>
        
        <div className="z-10 flex flex-col items-center gap-12">
          <div className="text-center animate-[bounce_3s_ease-in-out_infinite]">
            <h1 className="text-7xl md:text-9xl font-pixelify text-[#ffdb7a] tracking-widest drop-shadow-[0_5px_15px_rgba(255,219,122,0.6)]">
              DATA
            </h1>
            <h1 className="text-7xl md:text-9xl font-pixelify text-[#4ade80] tracking-widest drop-shadow-[0_5px_15px_rgba(74,222,128,0.6)] mt-[-15px]">
              RAIDERS
            </h1>
          </div>
          
          <div className="flex flex-col gap-4 w-72 items-center">
            <button 
              onClick={() => setShowLobby(true)}
              className="w-full bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] text-[#fde6b3] border-b-[6px] border-[#92400e] active:border-b-0 active:translate-y-[6px] font-pixelify tracking-widest px-6 py-4 rounded-xl text-3xl transition-all shadow-lg"
            >
              START GAME
            </button>
            <button 
              onClick={() => setShowHowToPlay(true)}
              className="w-full bg-[#1b5e20] hover:bg-[#14532d] active:bg-[#064e3b] text-[#86efac] border-b-[6px] border-[#064e3b] active:border-b-0 active:translate-y-[6px] font-pixelify tracking-wider px-6 py-3 rounded-xl text-2xl transition-all shadow-lg"
            >
              HOW TO PLAY
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="w-full bg-[#5c3e21] hover:bg-[#784f2b] active:bg-[#3e240f] text-[#d4b483] border-b-[6px] border-[#3e240f] active:border-b-0 active:translate-y-[6px] font-pixelify tracking-wider px-6 py-3 rounded-xl text-2xl transition-all shadow-lg"
            >
              SETTINGS
            </button>
          </div>
        </div>

        {showHowToPlay && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col gap-5 overflow-hidden">
              <h2 className="text-3xl font-pixelify text-[#ffdb7a] tracking-wider text-center drop-shadow-md shrink-0">HOW TO PLAY</h2>
              
              <div className="bg-[#5c3e21] p-4 rounded-xl border-2 border-[#3e240f] overflow-y-auto custom-scrollbar text-sm text-[#fde6b3] flex flex-col gap-4 font-semibold">
                
                <section>
                  <h3 className="text-[#4ade80] font-black text-lg mb-1 drop-shadow-sm font-pixelify tracking-wide">🎮 THE GOAL</h3>
                  <p>You are a Data Raider. Your mission is to clear the dungeon room by eliminating target enemies. Each enemy is a <span className="text-[#facc15] font-bold">row of data</span> in the target database table.</p>
                </section>

                <section>
                  <h3 className="text-[#4ade80] font-black text-lg mb-1 drop-shadow-sm font-pixelify tracking-wide">⚔️ COMBAT & SQL</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Use the <span className="text-[#ffdb7a] font-bold bg-[#3e240f] px-1 rounded">TERMINAL</span> on the right to interact with the database.</li>
                    <li>Type SQL commands (e.g., <code className="text-[#38bdf8] bg-[#1e1208] px-1 rounded">SELECT * FROM table</code>).</li>
                    <li>When you alter data in the terminal, the enemies in the room will react accordingly!</li>
                  </ul>
                </section>

                <section className="bg-[#2e1d0d] p-3 rounded-lg border border-[#3e240f]">
                  <h3 className="text-[#facc15] font-black text-lg mb-2 drop-shadow-sm font-pixelify tracking-wide">🧙‍♂️ SQL FOR BEGINNERS</h3>
                  <p className="mb-2 text-xs italic text-[#d4b483]">Never coded before? No problem! SQL is just a way to "talk" to the data. Here are the 3 spells you need to know:</p>
                  
                  <div className="space-y-3 mt-3">
                    <div>
                      <div className="text-[#38bdf8] font-bold font-mono text-xs bg-[#1e1208] px-2 py-1 rounded inline-block mb-1">SELECT * FROM enemies</div>
                      <p className="text-xs"><strong>The "Scout" Spell:</strong> Use this to look at all the data in the table. It helps you see what enemies exist and what their stats are.</p>
                    </div>
                    
                    <div>
                      <div className="text-[#fca5a5] font-bold font-mono text-xs bg-[#1e1208] px-2 py-1 rounded inline-block mb-1">DELETE FROM enemies WHERE name='Slime'</div>
                      <p className="text-xs"><strong>The "Destroy" Spell:</strong> Use this to permanently delete rows. <span className="text-[#ef4444] font-bold">WHERE</span> is crucial—it targets specific enemies. If you forget it, you might delete everything!</p>
                    </div>

                    <div>
                      <div className="text-[#86efac] font-bold font-mono text-xs bg-[#1e1208] px-2 py-1 rounded inline-block mb-1">UPDATE enemies SET hp=0 WHERE id=3</div>
                      <p className="text-xs"><strong>The "Alter" Spell:</strong> Use this to change existing data. You can set an enemy's HP to 0 to instantly defeat them!</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[#4ade80] font-black text-lg mb-1 drop-shadow-sm font-pixelify tracking-wide">🎯 CONTROLS</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><span className="text-[#ffdb7a] font-bold">W, A, S, D</span> - Move your character.</li>
                    <li><span className="text-[#ffdb7a] font-bold">Mouse Click</span> - Target an enemy to inspect their data.</li>
                    <li><span className="text-[#ffdb7a] font-bold">1, 2, 3, 4, 5</span> - Select your active spell (changes the type of data manipulation).</li>
                    <li><span className="text-[#ffdb7a] font-bold">E</span> - Cast your selected spell at your locked target!</li>
                    <li><span className="text-[#ffdb7a] font-bold">R</span> - Reset the room if you make a mistake and corrupt the database.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-[#4ade80] font-black text-lg mb-1 drop-shadow-sm font-pixelify tracking-wide">💡 TIPS</h3>
                  <p>Pay close attention to the <span className="text-[#facc15] font-bold">MISSION OBJECTIVE</span> and <span className="text-[#facc15] font-bold">TABLE SCHEMA</span> on the left panel. They tell you exactly what data needs to be altered to unlock the portal.</p>
                </section>

              </div>

              <button 
                onClick={() => setShowHowToPlay(false)}
                className="bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] text-[#fde6b3] border-b-[4px] border-[#92400e] active:border-b-0 active:translate-y-[4px] font-bold px-4 py-3 rounded-lg mt-2 transition-all tracking-wider text-sm shrink-0"
              >
                GOT IT!
              </button>
            </div>
          </div>
        )}

        {showLobby && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-2xl p-6 w-80 shadow-2xl flex flex-col gap-5 transform transition-all scale-100">
              <h2 className="text-3xl font-pixelify text-[#ffdb7a] tracking-wider text-center drop-shadow-md">LOBBY SETUP</h2>
              <div className="bg-[#5c3e21] p-4 rounded-xl border-2 border-[#3e240f] flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#fde6b3] mb-1 tracking-wider">PLAYER NAME</label>
                  <input 
                    type="text" 
                    value={playerName} 
                    onChange={(e) => setPlayerName(e.target.value)}
                    maxLength={12}
                    className="w-full bg-[#2e1d0d] border-[3px] border-[#1e1208] rounded px-3 py-2 text-sm font-mono text-[#4ade80] focus:outline-none focus:border-[#d97706] shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#fde6b3] mb-1 tracking-wider">GAME MODE</label>
                  <select 
                    value={gameMode}
                    onChange={(e) => setGameMode(e.target.value)}
                    className="w-full bg-[#2e1d0d] border-[3px] border-[#1e1208] rounded px-3 py-2 text-sm font-bold text-[#facc15] focus:outline-none focus:border-[#d97706] shadow-inner cursor-pointer"
                  >
                    <option value="Standard">Multiplayer Dungeon</option>
                    <option value="Speedrun">Speedrun Mode</option>
                    <option value="SinglePlayer" disabled>Single Player Sandbox (Soon)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#fde6b3] mb-1 tracking-wider">CHARACTER CLASS</label>
                  <select 
                    value={playerClass}
                    onChange={(e) => setPlayerClass(e.target.value)}
                    className="w-full bg-[#2e1d0d] border-[3px] border-[#1e1208] rounded px-3 py-2 text-sm font-bold text-[#facc15] focus:outline-none focus:border-[#d97706] shadow-inner cursor-pointer"
                  >
                    <option value="Archer">Archer</option>
                    <option value="Swordsman">Swordsman</option>
                    <option value="Wizard">Wizard</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <button 
                  onClick={() => setShowLobby(false)}
                  className="flex-1 bg-[#5c3e21] hover:bg-[#3e240f] text-[#d4b483] border-b-[4px] border-[#3e240f] active:border-b-0 active:translate-y-[4px] font-bold py-3 rounded-lg transition-all text-sm"
                >
                  CANCEL
                </button>
                <button 
                  onClick={() => { setShowLobby(false); setView('LOADING'); }}
                  className="flex-1 bg-[#4ade80] hover:bg-[#22c55e] active:bg-[#16a34a] text-[#064e3b] border-b-[4px] border-[#16a34a] active:border-b-0 active:translate-y-[4px] font-bold py-3 rounded-lg transition-all text-sm shadow-[0_0_10px_rgba(74,222,128,0.5)]"
                >
                  JOIN SERVER
                </button>
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-2xl p-6 w-80 shadow-2xl flex flex-col gap-5 transform transition-all scale-100">
              <h2 className="text-3xl font-pixelify text-[#ffdb7a] tracking-wider text-center drop-shadow-md">SETTINGS</h2>
              <div className="bg-[#5c3e21] p-4 rounded-xl border-2 border-[#3e240f] flex flex-col gap-4">
                
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-[#fde6b3] tracking-wider">CRT FILTER</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={useCRT} onChange={() => setUseCRT(!useCRT)} />
                    <div className="w-11 h-6 bg-[#2e1d0d] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#fde6b3] after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4ade80]"></div>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#fde6b3] mb-1 tracking-wider">MASTER VOLUME</label>
                  <input type="range" min="0" max="100" defaultValue="50" className="w-full accent-[#d97706] cursor-pointer" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#fde6b3] mb-1 tracking-wider">SFX VOLUME</label>
                  <input type="range" min="0" max="100" defaultValue="80" className="w-full accent-[#d97706] cursor-pointer" />
                </div>

              </div>
              <button 
                onClick={() => setShowSettings(false)}
                className="bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] text-[#fde6b3] border-b-[4px] border-[#92400e] active:border-b-0 active:translate-y-[4px] font-bold px-4 py-3 rounded-lg mt-2 transition-all tracking-wider text-sm"
              >
                SAVE & CLOSE
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'LOADING') {
    setTimeout(() => setView('GAME'), 1500);
    return (
      <div className={`h-full w-full bg-[#1b3d1b] flex flex-col items-center justify-center font-sans ${useCRT ? 'crt' : ''}`}>
        <div className="w-16 h-16 border-[6px] border-[#523315] border-t-[#4ade80] rounded-full animate-spin mb-6 shadow-lg"></div>
        <p className="text-[#4ade80] font-mono font-bold text-lg animate-pulse tracking-widest drop-shadow-md">CONNECTING TO DATABASE...</p>
      </div>
    );
  }

  // view === 'GAME'
  return (
    <div className={`h-full w-full bg-[#1b3d1b] overflow-hidden ${useCRT ? 'crt relative' : ''}`}>
      <div className="w-full h-full p-3 md:p-5 text-[#fde6b3] font-sans flex flex-row gap-5 relative z-10">
        
        {/* ── LEFT COLUMN (Data & Context) ────────────────── */}
        <div className="flex flex-col w-[280px] lg:w-[320px] gap-3 shrink-0 h-full overflow-y-auto custom-scrollbar pr-1 pb-2">
          
          {/* Room Header */}
          <div className="bg-[#5c3e21] border-[6px] border-[#3e240f] rounded-2xl p-3 shadow-[inset_0_0_10px_rgba(0,0,0,0.5),0_6px_12px_rgba(0,0,0,0.5)] shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold bg-[#3e240f]/60 px-2.5 py-0.5 rounded border border-[#3e240f]">ROOM {roomNum}/5</span>
            {gameMode === 'Speedrun' && (
              <span className="text-xs font-mono font-bold bg-[#ef4444]/20 text-[#fca5a5] px-2 py-0.5 rounded border border-[#ef4444]/30 shadow-inner">
                ⏱ {formatTime(elapsedTime)}
              </span>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="w-2 h-2 rounded-full bg-[#4ade80] shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse"></div>
              <span className="text-xs font-semibold text-[#fde6b3]">{onlineCount} online</span>
            </div>
          </div>
          <h1 className="text-xl font-black text-[#ffdb7a] tracking-wide drop-shadow-md">{schemaInfo.table_name || roomName}</h1>
          {me && (
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="font-bold text-[#facc15] drop-shadow-sm">⭐ {me.score ?? 0} pts</span>
              <div className="flex items-center gap-1.5 flex-1">
                <span className="font-bold text-[#fca5a5]">HP</span>
                <div className="flex-1 h-3 bg-[#2e1d0d] rounded-sm overflow-hidden border border-[#3e240f]">
                  <div
                    className={`h-full transition-all duration-300 ${(me.hp / Math.max(1, me.max_hp)) > 0.4 ? "bg-[#4ade80]" : "bg-[#ef4444]"}`}
                    style={{ width: `${(me.hp / Math.max(1, me.max_hp)) * 100}%` }}
                  />
                </div>
                <span className="font-bold text-[#fde6b3]">{me.hp}/{me.max_hp}</span>
              </div>
            </div>
          )}
        </div>

        {/* Mission Objective */}
        <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-xl p-3 shadow-inner shrink-0">
          <h2 className="text-sm font-black text-[#ffdb7a] tracking-wider mb-2 flex items-center gap-1.5 drop-shadow-sm">
            <span>📜</span> MISSION OBJECTIVE
          </h2>
          <p className="text-sm font-bold text-white bg-[#523315] border-2 border-[#3e240f] rounded-lg px-3 py-2 shadow-inner">
            {objective || "Loading..."}
          </p>
          {hint && (
            <p className="text-xs text-[#fde6b3]/80 mt-2 italic font-semibold">
              💡 {hint}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {!gameState?.room_cleared ? (
              <span className="text-xs font-bold text-[#fca5a5]">⚔ {gameState?.targets_remaining ?? enemies.length} targets remaining</span>
            ) : (
              <span className="text-xs font-bold text-[#4ade80]">✓ All clear — walk to the portal!</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {allowedSpells.map((sp: string) => (
              <span key={sp} className="text-[10px] font-bold bg-[#3e240f] border-2 border-[#2e1d0d] px-2 py-0.5 rounded shadow-sm text-[#fde6b3]">
                {sp}
              </span>
            ))}
          </div>
        </div>

        {/* Schema Card / Query Results */}
        {((queryResult && queryResult.success && queryResult.columns?.length > 0) || schemaInfo.columns) && (() => {
          const showQuery = (queryResult && queryResult.success && queryResult.columns?.length > 0);
          const columns = showQuery ? queryResult.columns : schemaInfo.columns;
          const rows = showQuery ? queryResult.rows : (schemaInfo.sample_data || []);
          return (
            <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-xl p-3 flex flex-col shadow-inner overflow-hidden flex-1 min-h-[200px]">
              <h2 className="text-sm font-black text-[#ffdb7a] tracking-wider mb-2 flex items-center gap-1.5 drop-shadow-sm shrink-0">
                <span>🗃️</span> {showQuery ? "QUERY RESULT" : "TABLE SCHEMA"}
              </h2>
              <div className="bg-[#523315] rounded border-[2px] border-[#3e240f] shadow-inner flex flex-col overflow-hidden h-full">
                <div className="bg-[#3e240f] border-b-[2px] border-[#2e1d0d] px-3 py-1.5 shrink-0 flex justify-between items-center">
                  <span className="text-xs font-mono font-bold text-[#fde6b3] drop-shadow-sm">
                    {schemaInfo.table_name}
                  </span>
                  {showQuery && (
                    <span className="text-[10px] font-bold text-[#facc15]">{rows.length} rows</span>
                  )}
                </div>
                <div className="overflow-auto bg-[#8c5f36]/10 flex-1 custom-scrollbar">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b-[2px] border-[#3e240f] sticky top-0 bg-[#523315] z-10">
                        {columns.map((col: string) => (
                          <th key={col} className="px-2 py-1.5 text-left font-bold text-[#facc15] whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any[], i: number) => (
                        <tr key={i} className="border-b-[1px] border-[#3e240f]/50 hover:bg-[#3e240f]/30">
                          {row.map((cell: any, j: number) => (
                            <td key={j} className="px-2 py-1 font-mono text-[#fde6b3] whitespace-nowrap">{String(cell)}</td>
                          ))}
                        </tr>
                      ))}
                      {!showQuery && (
                        <tr>
                          <td colSpan={columns.length} className="px-2 py-1 text-[#d4b483] text-center italic">...</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

      </div>

      {/* ── CENTER COLUMN (Canvas) ─────────────────────── */}
      <div className="flex flex-col w-full flex-1 h-full min-w-0 border-[6px] border-[#3e240f] rounded-2xl overflow-hidden shadow-[0_0_15px_rgba(0,0,0,0.5)] relative">
        <GameCanvas ws={ws} gameState={gameState} myId={myId} attacks={attacks} onRequestQuit={() => setShowQuitConfirm(true)} />
      </div>

      {/* ── RIGHT COLUMN (Interaction) ─────────────────── */}
      <div className="flex flex-col w-[280px] lg:w-[320px] gap-3 shrink-0 h-full overflow-y-auto custom-scrollbar pl-1 pb-2">
        
        {/* Server Stats Widget */}
        {serverStats && (
          <div className="bg-[#5c3e21] border-[4px] border-[#3e240f] rounded-xl p-2 shadow-[inset_0_0_10px_rgba(0,0,0,0.5),0_6px_12px_rgba(0,0,0,0.5)] shrink-0">
            <h2 className="text-[10px] font-black text-[#facc15] tracking-wider mb-1 flex items-center justify-between">
              <span>SERVER METRICS</span>
              <span className="text-[#4ade80] font-mono shadow-inner bg-[#2e1d0d] px-1.5 py-0.5 rounded border border-[#1e1208]">LIVE</span>
            </h2>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] font-mono text-[#fde6b3] font-bold">
              <div className="bg-[#3e240f] px-1.5 py-0.5 rounded">Players: <span className="text-white">{serverStats.players_online}</span></div>
              <div className="bg-[#3e240f] px-1.5 py-0.5 rounded">Tick: <span className="text-white">{serverStats.tick_rate}Hz</span></div>
              <div className="bg-[#3e240f] px-1.5 py-0.5 rounded">Uptime: <span className="text-white">{serverStats.uptime_seconds}s</span></div>
              <div className="bg-[#3e240f] px-1.5 py-0.5 rounded">Q / Proc: <span className="text-white">{serverStats.event_queue_size} / {serverStats.events_processed}</span></div>
            </div>
          </div>
        )}

        {/* SQL Terminal */}
        <div className="bg-[#5c3e21] border-[6px] border-[#3e240f] rounded-2xl p-3 flex flex-col shrink-0 shadow-[inset_0_0_10px_rgba(0,0,0,0.5),0_6px_12px_rgba(0,0,0,0.5)]">
          <h2 className="text-sm font-black text-[#4ade80] tracking-wider mb-2 flex items-center gap-1.5 drop-shadow-sm">
            <span></span> TERMINAL
          </h2>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[#4ade80] font-mono text-xl font-bold">»</span>
            <input
              type="text"
              value={sqlInput}
              onChange={(e) => setSqlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendQuery()}
              placeholder={`SELECT * FROM ...`}
              className="flex-1 min-w-0 bg-[#2e1d0d] border-[3px] border-[#1e1208] rounded px-3 py-2 text-sm font-mono text-[#4ade80] placeholder-[#784f2b] focus:outline-none focus:border-[#4ade80] transition-colors shadow-inner"
            />
            <button
              onClick={sendQuery}
              className="bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] text-[#fde6b3] border-b-[4px] border-[#92400e] active:border-b-0 active:translate-y-[4px] font-black tracking-wider px-3 py-2 rounded-lg text-sm transition-all focus:outline-none"
            >
              RUN
            </button>
          </div>
          {queryResult && !queryResult.success && (
            <p className="text-xs text-red-400 font-mono mt-1">Error: {queryResult.message}</p>
          )}
        </div>

        {/* Chat / Logs */}
        <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-xl flex flex-col p-3 flex-1 min-h-0 shadow-inner overflow-hidden">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-black text-[#ffdb7a] tracking-wider flex items-center drop-shadow-sm">
              LOGS
            </h2>
            <button
              onClick={() => setMessages([])}
              className="text-[10px] text-[#fde6b3] font-bold bg-[#523315] hover:bg-[#3e240f] px-2.5 py-1 rounded shadow-inner transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-1 text-xs">
            {messages.length === 0 && (
              <p className="text-[#fde6b3]/50 text-[10px] text-center mt-6">No messages yet...</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`px-2.5 py-1.5 rounded-lg max-w-full break-words text-[11px] font-bold ${
                  m.startsWith("✅") ? "bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/30" :
                  m.startsWith("❌") ? "bg-[#ef4444]/20 text-[#fca5a5] border border-[#ef4444]/30" :
                  m.startsWith("🔍") ? "bg-[#38bdf8]/20 text-[#bae6fd] border border-[#38bdf8]/30 font-mono" :
                  m.startsWith("📊") ? "bg-[#c084fc]/20 text-[#e9d5ff] border border-[#c084fc]/30" :
                  (m.startsWith("⚡") || m.startsWith("👋")) ? "bg-[#facc15]/20 text-[#fde047] border border-[#facc15]/30" :
                  m.startsWith("⚔") ? "bg-[#f87171]/20 text-[#fca5a5] border border-[#f87171]/30" :
                  m.startsWith("⟳") ? "bg-[#fb923c]/20 text-[#fdba74] border border-[#fb923c]/30" :
                  "bg-[#523315] text-[#fde6b3] shadow-inner"
                }`}>
                {m.replace(/^[✅❌🔍📊⚡👋⚔⟳]\s*/, "")}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Chat..."
              className="flex-1 min-w-0 bg-[#2e1d0d] border-[2px] border-[#1e1208] rounded px-3 py-1.5 text-xs text-[#fde6b3] font-medium focus:outline-none focus:border-[#d97706] transition-colors shadow-inner"
            />
            <button
              onClick={sendChat}
              className="bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] text-[#fde6b3] font-bold px-3 py-1.5 rounded text-xs transition-colors cursor-pointer"
            >
              Send
            </button>
          </div>
        </div>

        {/* Server Stats */}
        {serverStats && (
          <div className="bg-[#1b3d1b] border-[4px] border-[#0d1f0d] rounded-xl p-2.5 shadow-inner shrink-0">
            <h2 className="text-[10px] font-black text-[#4ade80] tracking-wider mb-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] shadow-[0_0_6px_rgba(74,222,128,0.8)] animate-pulse"></span>
              SERVER STATS
            </h2>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
              <span className="text-[#86efac]">Players</span>
              <span className="text-[#fde6b3] text-right">{serverStats.players_online}</span>
              <span className="text-[#86efac]">Tick Rate</span>
              <span className="text-[#fde6b3] text-right">{serverStats.tick_rate} Hz</span>
              <span className="text-[#86efac]">Queue</span>
              <span className="text-[#fde6b3] text-right">{serverStats.event_queue_size} pending</span>
              <span className="text-[#86efac]">Events</span>
              <span className="text-[#fde6b3] text-right">{serverStats.events_processed} total</span>
              <span className="text-[#86efac]">Uptime</span>
              <span className="text-[#fde6b3] text-right">{Math.floor(serverStats.uptime_seconds / 60)}m {serverStats.uptime_seconds % 60}s</span>
              <span className="text-[#86efac]">Room</span>
              <span className="text-[#fde6b3] text-right">{serverStats.room_number}/5</span>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="bg-[#5c3e21] border-[4px] border-[#3e240f] rounded-xl p-2 shadow-inner shrink-0">
          <h2 className="text-[10px] font-black text-[#d4b483] tracking-wider mb-1">CONTROLS</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-[#fde6b3] font-semibold">
            <span><b className="text-[#ffdb7a]">WASD</b> move</span>
            <span><b className="text-[#ffdb7a]">1-5</b> spell</span>
            <span><b className="text-[#ffdb7a]">E</b> cast</span>
            <span><b className="text-[#ffdb7a]">R</b> reset</span>
          </div>
        </div>

      </div>

      {/* ── TUTORIAL OVERLAY ──────────────────────────── */}
      {tutorialStep > 0 && (
        <div className="absolute inset-0 z-50 flex flex-col pointer-events-auto">
          
          {/* Mirror Layout for Highlights */}
          <div className="absolute inset-0 p-3 md:p-5 overflow-hidden pointer-events-none">
            <div className="w-full h-full flex flex-row gap-5">
              <div className={`w-[280px] lg:w-[320px] shrink-0 h-full rounded-2xl transition-all duration-500 ${tutorialStep === 3 ? 'shadow-[0_0_0_9999px_rgba(0,0,0,0.8),inset_0_0_20px_#facc15] border-[4px] border-[#facc15] bg-[#facc15]/10' : ''}`}></div>
              <div className={`flex-1 h-full rounded-2xl transition-all duration-500 ${tutorialStep === 2 ? 'shadow-[0_0_0_9999px_rgba(0,0,0,0.8),inset_0_0_20px_#facc15] border-[4px] border-[#facc15] bg-[#facc15]/10' : ''}`}></div>
              <div className={`w-[280px] lg:w-[320px] shrink-0 h-full rounded-2xl transition-all duration-500 ${(tutorialStep === 4 || tutorialStep === 5) ? 'shadow-[0_0_0_9999px_rgba(0,0,0,0.8),inset_0_0_20px_#facc15] border-[4px] border-[#facc15] bg-[#facc15]/10' : ''}`}></div>
            </div>
          </div>
          
          {/* Fallback Dark Overlay for Steps 1 & 6 */}
          {(tutorialStep === 1 || tutorialStep === 6) && (
            <div className="absolute inset-0 bg-black/80 pointer-events-none"></div>
          )}

          {/* Dialogue Box */}
          <div className="relative z-10 w-[90%] max-w-4xl mx-auto mt-auto mb-10 bg-[#5c3e21] border-[6px] border-[#3e240f] rounded-2xl p-6 shadow-[0_10px_50px_rgba(0,0,0,1)] flex flex-col md:flex-row items-center md:items-end gap-6 animate-[bounce_0.3s_ease-out]">
            <div className="w-24 h-24 bg-[#3e240f] border-4 border-[#2e1d0d] rounded-xl overflow-hidden shrink-0 hidden md:block">
               <div className="w-full h-full bg-[#facc15] flex items-center justify-center text-5xl pb-2">🤖</div>
            </div>
            <div className="flex-1 flex flex-col justify-between h-full py-1 text-center md:text-left">
              <h3 className="text-2xl font-pixelify text-[#4ade80] tracking-wider mb-2 drop-shadow-md">GUIDE</h3>
              <p className="text-[#fde6b3] font-bold text-lg md:text-xl leading-relaxed">
                {tutorialStep === 1 && "Welcome to Data Raiders! I'm here to get you up to speed. Ready?"}
                {tutorialStep === 2 && "This is the Game Canvas. Use [W][A][S][D] to move around. If you want to inspect an enemy's data, just click on them with your mouse to lock on!"}
                {tutorialStep === 3 && "This Left Panel is your Intel Screen! The MISSION OBJECTIVE tells you exactly which enemies you need to eliminate to unlock the portal. The TABLE SCHEMA reveals the exact column names of the database you'll need for your spells!"}
                {tutorialStep === 4 && "The Right Panel is your weapon—the SQL Terminal! Every enemy here is a row in a real database. To defeat them, you must type SQL commands like 'DELETE FROM table' or 'UPDATE table SET hp=0' and press [Enter]."}
                {tutorialStep === 5 && "Want a shortcut? You can press keys [1] through [5] to select a quick spell, lock onto an enemy, and press [E] to cast it directly without typing! Check the Logs below the terminal to see the results."}
                {tutorialStep === 6 && "You are ready! Use your intel, type your spells, and clear the database room. Good luck!"}
              </p>
            </div>
            <div className="flex gap-3 shrink-0 mt-4 md:mt-0">
              <button 
                onClick={() => setTutorialStep(0)}
                className="bg-[#5c3e21] hover:bg-[#3e240f] text-[#d4b483] border-b-[6px] border-[#3e240f] active:border-b-0 active:translate-y-[6px] font-pixelify tracking-widest px-6 py-4 rounded-xl text-2xl transition-all shadow-lg"
              >
                SKIP
              </button>
              <button 
                onClick={() => {
                  if (tutorialStep === 6) {
                    setTutorialStep(0);
                  } else {
                    setTutorialStep(s => s + 1);
                  }
                }}
                className="bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] text-[#fde6b3] border-b-[6px] border-[#92400e] active:border-b-0 active:translate-y-[6px] font-pixelify tracking-widest px-8 py-4 rounded-xl text-2xl transition-all shadow-lg"
              >
                {tutorialStep === 6 ? "START" : "NEXT ➔"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── QUIT CONFIRM OVERLAY ──────────────────────────── */}
      {showQuitConfirm && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-2xl p-6 w-80 shadow-2xl flex flex-col gap-5 transform transition-all scale-100">
            <h2 className="text-3xl font-pixelify text-[#ef4444] tracking-wider text-center drop-shadow-md">QUIT GAME?</h2>
            <div className="bg-[#5c3e21] p-4 rounded-xl border-2 border-[#3e240f] text-center">
              <p className="text-sm font-bold text-[#fde6b3] tracking-wider">Are you sure you want to return to the main menu?</p>
            </div>
            <div className="flex gap-3 mt-2">
              <button 
                onClick={() => setShowQuitConfirm(false)}
                className="flex-1 bg-[#5c3e21] hover:bg-[#3e240f] text-[#d4b483] border-b-[4px] border-[#3e240f] active:border-b-0 active:translate-y-[4px] font-bold py-3 rounded-lg transition-all text-sm"
              >
                CANCEL
              </button>
              <button 
                onClick={() => { setShowQuitConfirm(false); setView('TITLE'); }}
                className="flex-1 bg-[#ef4444] hover:bg-[#dc2626] active:bg-[#b91c1c] text-[#fde6b3] border-b-[4px] border-[#b91c1c] active:border-b-0 active:translate-y-[4px] font-bold py-3 rounded-lg transition-all text-sm shadow-[0_0_10px_rgba(239,68,68,0.5)]"
              >
                QUIT
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </div>
  );
}
