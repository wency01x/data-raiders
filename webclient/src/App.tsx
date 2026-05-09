import { useEffect, useState, useRef } from "react";
import GameCanvas from "./GameCanvas";
import Editor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import "./index.css";
import introMusicUrl from './assets/audio/bg-intro-music.mp3';
import ingameMusicUrl from './assets/audio/bg-ingame-music.mp3';

const ROLE_OPTIONS = [
  { value: "Archer", icon: "🏹", label: "Archer (Delete)" },
  { value: "Swordsman", icon: "⚔️", label: "Swordsman (Insert, Update)" },
  { value: "Wizard", icon: "🧙", label: "Wizard (Query)" },
] as const;

function CustomSelect({ value, options, onChange, label }: { value: string, options: {value: string, label: string}[], onChange: (val: string) => void, label: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedLabel = options.find(o => o.value === value)?.label || value;

  return (
    <div className="relative">
      <label className="block text-[10px] font-bold text-[#fde6b3] mb-1 tracking-wider">{label}</label>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#2e1d0d] border-[3px] border-[#1e1208] rounded px-3 py-2 text-sm font-bold text-[#facc15] shadow-inner cursor-pointer flex justify-between items-center"
      >
        <span className="truncate whitespace-nowrap">{selectedLabel}</span>
        <span className="text-[10px] opacity-70 ml-2 shrink-0">▼</span>
      </div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-[calc(100%+2px)] left-0 min-w-full w-max bg-[#2e1d0d] border-[3px] border-[#1e1208] rounded z-50 overflow-hidden shadow-[0_5px_15px_rgba(0,0,0,0.5)]">
            {options.map(opt => (
              <div 
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`px-3 py-2 text-sm font-bold cursor-pointer transition-colors whitespace-nowrap ${value === opt.value ? 'bg-[#d97706] text-[#1e1208]' : 'text-[#facc15] hover:bg-[#3e240f]'}`}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function getRoleBadgeLabel(role: string) {
  if (role === "Wizard") return "QUERY";
  if (role === "Swordsman") return "INSERT / UPDATE";
  return "DELETE";
}

function configureSqlTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme("data-raiders-sql", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "facc15", fontStyle: "bold" },
      { token: "string", foreground: "4ade80" },
      { token: "number", foreground: "0ea5e9" },
      { token: "comment", foreground: "d4b483", fontStyle: "italic" },
      { token: "identifier", foreground: "fde6b3" },
      { token: "delimiter", foreground: "d4b483" },
      { token: "operator", foreground: "f59e0b" },
    ],
    colors: {
      "editor.background": "#2E1D0D",
      "editor.foreground": "#FDE6B3",
      "editorLineNumber.foreground": "#A8825B",
      "editorLineNumber.activeForeground": "#FACC15",
      "editorCursor.foreground": "#FACC15",
      "editor.selectionBackground": "#D9770666",
      "editor.inactiveSelectionBackground": "#D9770635",
      "editor.lineHighlightBackground": "#3E240F",
      "editorGutter.background": "#2E1D0D",
      "editorIndentGuide.background1": "#784F2B88",
      "editorIndentGuide.activeBackground1": "#D97706AA",
    },
  });
}

export default function App() {
  type ViewState = 'ENTER' | 'TITLE' | 'LOBBY' | 'LOADING' | 'GAME';
  const [view, setView] = useState<ViewState>('ENTER');
  const [showSettings, setShowSettings] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [useCRT, setUseCRT] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [shouldConnect, setShouldConnect] = useState(false);
  const [scale, setScale] = useState(1);

  // ── Audio State ────────────────────────────────────────────────────────
  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const ingameAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    introAudioRef.current = new Audio(introMusicUrl);
    introAudioRef.current.loop = true;
    introAudioRef.current.volume = 0.5; // Set reasonable volume

    ingameAudioRef.current = new Audio(ingameMusicUrl);
    ingameAudioRef.current.loop = true;
    ingameAudioRef.current.volume = 0.4;

    return () => {
      introAudioRef.current?.pause();
      ingameAudioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const scaleY = window.innerHeight / 850;
      const scaleX = window.innerWidth / 1350;
      setScale(Math.min(scaleX, scaleY, 1));
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Lobby / server-browser state ─────────────────────────────────────────
  const [lobbyMode, setLobbyMode] = useState<'create' | 'join'>('create');
  const [lobbyError, setLobbyError] = useState('');

  // CREATE LOBBY — always points at YOUR local server (localhost)
  const [hostInfo, setHostInfo]           = useState<any>(null);
  const [isHostPinging, setIsHostPinging] = useState(false);
  const [lobbyIsOpen, setLobbyIsOpen]     = useState(false);
  const [amIHost, setAmIHost]             = useState(false);
  const [isOpening, setIsOpening]         = useState(false);

  // JOIN SERVER — whatever IP the user types
  const [joinIp, setJoinIp]           = useState('');
  const [joinInfo, setJoinInfo]       = useState<any>(null);
  const [isJoinPinging, setIsJoinPinging] = useState(false);
  const [joinError, setJoinError]     = useState('');
  const [joinNeedsRoleChange, setJoinNeedsRoleChange] = useState(false);

  // Derived: which host does the WebSocket connect to?
  const serverHost = lobbyMode === 'create' ? window.location.hostname : joinIp;
  
  const [messages, setMessages] = useState<string[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [sqlInput, setSqlInput] = useState("");
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [queryResult, setQueryResult] = useState<any>(null);
  const [onlineCount, setOnlineCount] = useState(1);
  const [serverStats, setServerStats] = useState<any>(null);
  const [showDeathScreen, setShowDeathScreen] = useState(false);
  const [deathCountdown, setDeathCountdown] = useState(3);
  const [showGameOver, setShowGameOver] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [attacks, setAttacks] = useState<Record<string, number>>({});
  const [playerName, setPlayerName] = useState(
    () => "Player_" + Math.floor(Math.random() * 100)
  );
  const [playerClass, setPlayerClass] = useState("Archer");
  const [gameMode, setGameMode] = useState("Standard");

  // ── Audio Playback Management ──────────────────────────────────────────
  const syncMusic = () => {
    if (!introAudioRef.current || !ingameAudioRef.current) return;
    const introAudio = introAudioRef.current;
    const ingameAudio = ingameAudioRef.current;

    // Stop and rewind all music when players die or game over
    if (showDeathScreen || showGameOver) {
      introAudio.pause();
      introAudio.currentTime = 0;
      ingameAudio.pause();
      ingameAudio.currentTime = 0;
      return;
    }

    // Play based on view
    if (view === 'TITLE' || view === 'LOBBY' || view === 'LOADING') {
      ingameAudio.pause();
      ingameAudio.currentTime = 0;
      if (introAudio.paused) {
        introAudio.play().catch(() => console.log('Autoplay blocked'));
      }
    } else if (view === 'GAME') {
      introAudio.pause();
      introAudio.currentTime = 0;
      if (ingameAudio.paused) {
        ingameAudio.play().catch(() => console.log('Autoplay blocked'));
      }
    }
  };

  useEffect(() => {
    syncMusic();
  }, [view, showDeathScreen, showGameOver]);

  useEffect(() => {
    // Attempt to start music on any click if it was blocked by browser autoplay policy
    const handleInteraction = () => syncMusic();
    document.addEventListener('click', handleInteraction);
    return () => document.removeEventListener('click', handleInteraction);
  }, [view, showDeathScreen, showGameOver]);
  const [speedrunStart, setSpeedrunStart] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const myIdRef = useRef<string | null>(null);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

  useEffect(() => {
    if (showDeathScreen) {
      setDeathCountdown(3);
      const iv = setInterval(() => {
        setDeathCountdown(c => Math.max(0, c - 1));
      }, 1000);
      return () => clearInterval(iv);
    }
  }, [showDeathScreen]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!shouldConnect) return;
    const loc = window.location;
    const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${serverHost}:8000/ws`;
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      console.error("Invalid WebSocket URL", url);
      setShouldConnect(false);
      return;
    }

    socket.onopen = () => {
      setWs(socket);
      setJoinNeedsRoleChange(false);
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
        case "player_left": {
          const leftName = msg.player_name ? msg.player_name.split('|')[0] : `Player ${(msg.player_id || "?").slice(0, 4)}`;
          setMessages((m) => [...m, `👋 ${leftName} left.`]);
          break;
        }
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
        case "enemy_buffed":
          setAttacks((a) => ({ ...a, ["buff_" + msg.enemy_id]: Date.now() }));
          break;
        case "lobby_error":
        case "lobby_closed":
          // Server rejected connection — show a clean UI error, not a browser alert
          setShouldConnect(false);
          setLobbyIsOpen(false);
          setHostInfo(null);
          setJoinInfo(null);
          setJoinNeedsRoleChange(Boolean(msg.change_role_required));
          setLobbyError(msg.message || 'Lobby is closed. The host must open it first.');
          setView('LOBBY');
          break;
        case "player_died":
          if (msg.player_id === myIdRef.current) {
            if (msg.lives_left > 0) {
              setShowDeathScreen(true);
            } else {
              // No lives left — show permanent game over screen
              setShowDeathScreen(false);
              setShowGameOver(true);
            }
          } else {
            const diedName = msg.player_name ? msg.player_name.split('|')[0] : `Player ${(msg.player_id || "?").slice(0, 4)}`;
            if (msg.lives_left > 0) {
              setMessages((m) => [...m, `💀 ${diedName} died! (${msg.lives_left} lives left)`]);
            } else {
              setMessages((m) => [...m, `☠️ ${diedName} is OUT — no lives left!`]);
            }
          }
          break;
        case "player_respawned":
          if (msg.player_id === myIdRef.current) {
            setShowDeathScreen(false);
          }
          break;
        case "query_result":
          setQueryResult(msg);
          if (msg.success) {
            const by = msg.queried_by ? `🧙 ${msg.queried_by} queried` : "📊 Query";
            setMessages((m) => [...m, `📊 ${by}: ${msg.message}`]);
          } else {
            setMessages((m) => [...m, `❌ ${msg.message}`]);
          }
          break;
      }
    };

    socket.onclose = () => setWs(null);
    return () => { socket.close(); };
  }, [playerName, playerClass, shouldConnect, gameMode, serverHost]);

  // Transition to GAME view when game starts
  useEffect(() => {
    if (gameState?.game_phase === 'JOURNEY_MAP') {
      setView('LOADING');
    }
  }, [gameState?.game_phase]);

  const pingLocalServer = async () => {
    setIsHostPinging(true);
    try {
      const res = await fetch(`${window.location.protocol}//${window.location.hostname}:8000/lobby`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHostInfo(data);
      setLobbyIsOpen(data.open === true);
    } catch {
      setHostInfo(null);
      setLobbyIsOpen(false);
    } finally {
      setIsHostPinging(false);
    }
  };

  const openLobby = async () => {
    setIsOpening(true);
    setLobbyError('');
    try {
      const res = await fetch(`${window.location.protocol}//${window.location.hostname}:8000/lobby/open`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setLobbyError(data.error || 'Failed to open lobby.');
        await pingLocalServer();
        return;
      }
      setLobbyIsOpen(true);
      setAmIHost(true);
      // Re-ping to refresh info
      await pingLocalServer();
    } catch {
      setLobbyError('Failed to connect to server.');
    } finally {
      setIsOpening(false);
    }
  };

  const leaveLobby = async () => {
    if (amIHost) {
      try {
        await fetch(`${window.location.protocol}//${window.location.hostname}:8000/lobby/close`, { method: 'POST' });
      } catch {}
    }
    setGameState(null);
    setMyId(null);
    setMessages([]);
    setShouldConnect(false);
    if (ws) ws.close();
    setWs(null);
    setLobbyIsOpen(false);
    setHostInfo(null);
    setJoinInfo(null);
    setJoinIp('');
    setLobbyError('');
    setAmIHost(false);
    setLobbyMode('create');
  };

  const pingJoinServer = async (ip: string) => {
    if (!ip.trim()) return;
    setIsJoinPinging(true);
    setJoinError('');
    setJoinInfo(null);
    try {
      const res = await fetch(`${window.location.protocol}//${ip.trim()}:8000/lobby`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setJoinInfo(data);
      setJoinIp(ip.trim()); // lock in the successfully-pinged IP
      setJoinNeedsRoleChange(false);
    } catch {
      setJoinError('Could not reach server at that address. Is the host running python3 runserver.py?');
      setJoinInfo(null);
    } finally {
      setIsJoinPinging(false);
    }
  };

  // Auto-ping localhost when entering the lobby view
  useEffect(() => {
    if (view === 'LOBBY') pingLocalServer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Poll /stats endpoint for Server Stats widget
  useEffect(() => {
    if (view !== 'GAME') return;
    const statsUrl = `${window.location.protocol}//${serverHost}:8000/stats`;
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

  useEffect(() => {
    if (view === 'GAME' && gameMode === 'Speedrun' && speedrunStart) {
      const iv = setInterval(() => {
        setElapsedTime(Date.now() - speedrunStart);
      }, 100);
      return () => clearInterval(iv);
    }
  }, [view, gameMode, speedrunStart]);

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

  const canCurrentPlayerQuery = () => {
    const livePlayer = gameState?.players?.find((p: any) => p.id === myId);
    return Boolean(livePlayer?.can_query ?? (playerClass === 'Wizard'));
  };

  const sendQuery = (queryText?: string) => {
    const sql = (queryText ?? sqlInput).trim();
    if (!sql || !ws) return;
    // Only current QUERY-role holder can send queries
    if (!canCurrentPlayerQuery()) return;
    ws.send(JSON.stringify({ type: "query", sql }));
    setMessages((m) => [...m, `🔍 > ${sql}`]);
  };

  const roomName = gameState?.room ?? "—";
  const roomNum = gameState?.room_number ?? 1;
  const objective = gameState?.objective ?? "";
  const hint = gameState?.hint ?? "";
  const allowedSpells = gameState?.allowed_spells ?? [];
  const enemies = gameState?.enemies?.filter((e: any) => e.alive) ?? [];
  const me = gameState?.players?.find((p: any) => p.id === myId);
  const canQuery = Boolean(me?.can_query ?? (playerClass === 'Wizard'));
  const sqlPreview = sqlInput.trim()
    ? sqlInput.trim().split('\n')[0]
    : "SELECT * FROM ...";
  const isWizardTerminalOpen = showSqlModal && canQuery;
  const currentRole = (me?.name?.split('|')?.[1] || playerClass) as "Archer" | "Swordsman" | "Wizard";
  const roleTutorial = {
    Archer: {
      badge: "🏹 ARCHER",
      step1: "Welcome, Archer. You are a precision Deleter. Your only combat spell is DELETE, so your job is to remove the exact target rows.",
      step4: "Your terminal is read-only for query execution. Let the Wizard run SELECT and share intel, then execute your DELETE spell on the correct target.",
      step5: "Archer controls: press [1] to keep DELETE ready, lock a target, then press [E] to cast. Your power is accuracy, not volume.",
      step6: "You are ready. Wait for Wizard intel, then cleanly DELETE the required targets to open the portal.",
    },
    Swordsman: {
      badge: "⚔️ SWORDSMAN",
      step1: "Welcome, Swordsman. You are the data modifier. Your combat spells are INSERT and UPDATE only.",
      step4: "Your terminal is read-only for query execution. Coordinate with the Wizard for SELECT results, then apply INSERT or UPDATE based on the objective.",
      step5: "Swordsman controls: use [1]/[2] to switch between INSERT and UPDATE in your role HUD, lock a target when needed, then press [E] to cast.",
      step6: "You are ready. Use INSERT and UPDATE with discipline to satisfy room logic and support your team.",
    },
    Wizard: {
      badge: "🧙 WIZARD",
      step1: "Welcome, Wizard. You are the query specialist. You can cast SELECT and JOIN, and you are the only player allowed to run SQL queries.",
      step4: "This right panel is your command station. Use the terminal to run SELECT queries and broadcast table intel to all players in the lobby.",
      step5: "Wizard controls: keep SELECT ready, lock enemies, press [E] to inspect, and use JOIN only when room targets are completed to trigger portal progression.",
      step6: "You are ready. Scout with SELECT, guide your teammates with accurate query intel, then JOIN at the right time.",
    },
  }[currentRole === "Wizard" || currentRole === "Swordsman" ? currentRole : "Archer"];

  let schemaInfo: any = {};
  try {
    schemaInfo = JSON.parse(gameState?.schema_info ?? "{}");
  } catch { schemaInfo = {}; }
  const schemaColumns = Array.isArray(schemaInfo?.columns) ? schemaInfo.columns : [];
  const schemaSampleRows = Array.isArray(schemaInfo?.sample_data) ? schemaInfo.sample_data : [];
  const schemaPreviewRows = schemaSampleRows
    .filter((row: any) => Array.isArray(row))
    .slice(0, 2)
    .map((row: any[]) => schemaColumns.map((_: any, i: number) => row[i] ?? "NULL"));
  while (schemaPreviewRows.length < 2 && schemaColumns.length > 0) {
    schemaPreviewRows.push(schemaColumns.map(() => "—"));
  }

  useEffect(() => {
    setQueryResult(null);
  }, [roomNum]);

  useEffect(() => {
    if (!canQuery) setShowSqlModal(false);
  }, [canQuery]);

  useEffect(() => {
    if (view === 'GAME' && roomNum === 1) {
      setTutorialStep(1);
    }
  }, [view, roomNum]);

  if (view === 'ENTER') {
    return (
      <div className={`h-full w-full bg-[#1e1208] flex flex-col items-center justify-center font-sans relative overflow-hidden cursor-pointer transition-all duration-500`}
           onClick={() => {
             if (introAudioRef.current) {
               introAudioRef.current.play().catch(() => console.log('Autoplay blocked'));
             }
             setView('TITLE');
           }}>
        <div style={{ transform: `scale(${scale})` }} className="z-10 flex flex-col items-center gap-6 origin-center animate-pulse">
          <h1 className="text-4xl md:text-6xl font-pixelify text-[#ffdb7a] tracking-widest drop-shadow-[0_5px_15px_rgba(255,219,122,0.6)]">
            CLICK TO ENTER
          </h1>
          <p className="text-[#d4b483] font-bold text-xl tracking-widest mt-[-10px]">
            DATA RAIDERS
          </p>
        </div>
      </div>
    );
  }

  if (view === 'TITLE') {
    return (
      <div className={`h-full w-full bg-scrolling-grid flex flex-col items-center justify-center font-sans relative overflow-hidden ${useCRT ? 'crt' : ''}`}>
        
        <div style={{ transform: `scale(${scale})` }} className="z-10 flex flex-col items-center gap-12 origin-center">
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
              onClick={() => setView('LOBBY')}
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
            <div style={{ transform: `scale(${scale})` }} className="bg-[#784f2b] border-[4px] border-[#523315] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col gap-5 overflow-hidden origin-center">
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
                    <li><span className="text-[#ffdb7a] font-bold">R</span> - Reset the level if you make a mistake and corrupt the database.</li>
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


        {showSettings && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
            <div style={{ transform: `scale(${scale})` }} className="bg-[#784f2b] border-[4px] border-[#523315] rounded-2xl p-6 w-80 shadow-2xl flex flex-col gap-5 transform transition-all origin-center">
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

  if (view === 'LOBBY') {
    const fmtUptime = (info: any) => {
      if (!info) return null;
      const s = info.uptime_seconds;
      return `${Math.floor(s / 60)}m ${s % 60}s`;
    };

    const selectedRoleTaken = !ws && joinNeedsRoleChange;
    const availableRoles = ROLE_OPTIONS.filter((r) => r.value !== playerClass);

    const classOptions = ROLE_OPTIONS.map((r) => ({
      value: r.value,
      label: `${r.icon} ${r.label}`,
    }));

    // Shared player setup block — class picker locked once connected
    const PlayerSetup = (
      <div className="bg-[#784f2b] border-[3px] border-[#523315] rounded-xl p-4 flex flex-col gap-3">
        <h2 className="text-xs font-black text-[#ffdb7a] tracking-widest">⚔️ PLAYER SETUP</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-[#fde6b3] mb-1 tracking-wider">PLAYER NAME</label>
            {ws ? (
              <div className="w-full bg-[#1e1208] border-[3px] border-[#2e1d0d] rounded px-3 py-2 text-sm font-mono text-[#6b4c2a] shadow-inner cursor-not-allowed">
                {playerName}
              </div>
            ) : (
              <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={12}
                className="w-full bg-[#2e1d0d] border-[3px] border-[#1e1208] rounded px-3 py-2 text-sm font-mono text-[#4ade80] focus:outline-none focus:border-[#d97706] shadow-inner" />
            )}
          </div>
          <div className="relative">
            {ws ? (
              <div>
                <label className="block text-[10px] font-bold text-[#fde6b3] mb-1 tracking-wider">CHARACTER CLASS (LOCKED)</label>
                <div className="w-full bg-[#1e1208] border-[3px] border-[#2e1d0d] rounded px-3 py-2 text-sm font-bold text-[#6b4c2a] shadow-inner cursor-not-allowed flex items-center gap-2">
                  <span>{playerClass === 'Wizard' ? '🧙' : playerClass === 'Archer' ? '🏹' : '⚔️'}</span>
                  <span>{playerClass}</span>
                  <span className="ml-auto text-[9px] bg-[#3e240f] text-[#d97706] px-1.5 py-0.5 rounded font-black tracking-wider">
                    {getRoleBadgeLabel(playerClass)}
                  </span>
                </div>
              </div>
            ) : (
              <CustomSelect
                label="CHARACTER CLASS"
                value={playerClass}
                onChange={(val) => {
                  setJoinNeedsRoleChange(false);
                  setLobbyError('');
                  setPlayerClass(val);
                }}
                options={classOptions}
              />
            )}
          </div>
          <CustomSelect
            label="GAME MODE"
            value={gameMode}
            onChange={setGameMode}
            options={[
              { value: "Standard", label: "⚔️ Multiplayer Dungeon" },
              { value: "Speedrun", label: "⏱ Speedrun Mode" }
            ]}
          />
        </div>
        {!ws && selectedRoleTaken && (
          <div className="bg-[#450a0a] border-2 border-[#dc2626] rounded-lg p-3">
            <p className="text-[#fca5a5] text-xs font-bold tracking-wide">
              Selected role is already taken on this server. Change role to continue.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {availableRoles.map((role) => (
                <button
                  key={role.value}
                  onClick={() => {
                    setPlayerClass(role.value);
                    setJoinNeedsRoleChange(false);
                    setLobbyError('');
                  }}
                  className="bg-[#3e240f] hover:bg-[#523315] text-[#fde6b3] border border-[#2e1d0d] px-2.5 py-1 rounded text-[10px] font-black tracking-wide transition-colors"
                >
                  {role.icon} Change to {role.value}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );

    return (
      <div className={`h-full w-full bg-scrolling-grid flex flex-col items-center justify-center font-sans relative overflow-hidden ${useCRT ? 'crt' : ''}`}>
        <div style={{ transform: `scale(${scale})` }} className="z-10 w-full max-w-5xl px-4 md:px-8 flex flex-col gap-5 origin-center">

          {/* Title */}
          <div className="text-center">
            <h1 className="text-5xl font-pixelify text-[#ffdb7a] tracking-widest drop-shadow-[0_3px_15px_rgba(255,219,122,0.7)]">
              SERVER LOBBY
            </h1>
            <p className="text-[#d4b483] font-semibold text-sm mt-1 tracking-wider">Host a game or join a friend&apos;s server</p>
          </div>

          {/* Error banner */}
          {lobbyError && (
            <div className="bg-[#450a0a] border-2 border-[#dc2626] rounded-xl px-4 py-3 flex items-center gap-3 max-w-2xl mx-auto w-full">
              <span className="text-xl">⚠️</span>
              <p className="text-[#fca5a5] font-bold text-sm flex-1">{lobbyError}</p>
              <button onClick={() => setLobbyError('')} className="text-[#fca5a5] hover:text-white text-lg leading-none">×</button>
            </div>
          )}

          {/* Mode Tab Switcher */}
          <div className={`flex gap-0 bg-[#2e1d0d] border-[4px] border-[#1e1208] rounded-2xl p-1.5 max-w-2xl w-full mx-auto ${shouldConnect ? 'opacity-50 pointer-events-none' : ''}`}>
            <button
              onClick={() => { setLobbyMode('create'); setLobbyError(''); pingLocalServer(); }}
              className={`flex-1 py-3 rounded-xl font-pixelify tracking-widest text-lg transition-all ${
                lobbyMode === 'create'
                  ? 'bg-[#4ade80] text-[#064e3b] shadow-[0_0_15px_rgba(74,222,128,0.5)] border-b-[4px] border-[#16a34a]'
                  : 'text-[#6b4c2a] hover:text-[#d4b483]'
              }`}
            >
              🏰 CREATE LOBBY
            </button>
            <button
              onClick={() => { setLobbyMode('join'); setLobbyError(''); setJoinInfo(null); setJoinError(''); }}
              className={`flex-1 py-3 rounded-xl font-pixelify tracking-widest text-lg transition-all ${
                lobbyMode === 'join'
                  ? 'bg-[#38bdf8] text-[#0c4a6e] shadow-[0_0_15px_rgba(56,189,248,0.5)] border-b-[4px] border-[#0369a1]'
                  : 'text-[#6b4c2a] hover:text-[#d4b483]'
              }`}
            >
              🔗 JOIN SERVER
            </button>
          </div>

          {/* Main board */}
          <div className="bg-[#5c3e21] border-[6px] border-[#3e240f] rounded-2xl p-5 shadow-[inset_0_0_20px_rgba(0,0,0,0.5),0_10px_30px_rgba(0,0,0,0.7)] flex flex-col lg:flex-row gap-5">

            {/* LEFT COLUMN: Setup */}
            <div className={`flex flex-col gap-4 flex-1 ${shouldConnect ? 'opacity-50 pointer-events-none' : ''}`}>
              {lobbyMode === 'create' ? (
                /* ─── CREATE LOBBY mode ─── */
                <>
                  <div className="bg-[#3e240f] border-[3px] border-[#2e1d0d] rounded-xl p-4 flex flex-col gap-3">
                    <h2 className="text-xs font-black text-[#4ade80] tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#4ade80] shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse" />
                      YOUR SERVER IS READY
                    </h2>
                    {isHostPinging ? (
                      <p className="text-xs text-[#d4b483] italic text-center animate-pulse">Detecting your server IP...</p>
                    ) : hostInfo ? (
                      <>
                        <div className="text-center">
                          <p className="text-[10px] text-[#d4b483] mb-1 tracking-wider font-semibold">SHARE THIS IP WITH YOUR FRIENDS</p>
                          <div className="font-mono text-[#ffdb7a] text-2xl font-black bg-[#1e1208] rounded-lg py-4 px-4 border-2 border-[#2e1d0d] shadow-inner tracking-widest select-all cursor-text">
                            {hostInfo.server_ip}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs font-mono text-center">
                          <div className="bg-[#2e1d0d] rounded-lg p-2 border border-[#1e1208]">
                            <p className="text-[#86efac] text-[10px] mb-0.5">PORT</p>
                            <p className="text-[#facc15] font-black">8000</p>
                          </div>
                          <div className="bg-[#2e1d0d] rounded-lg p-2 border border-[#1e1208]">
                            <p className="text-[#86efac] text-[10px] mb-0.5">PLAYERS</p>
                            <p className="text-[#fde6b3] font-black">{hostInfo.players_online}</p>
                          </div>
                          <div className="bg-[#2e1d0d] rounded-lg p-2 border border-[#1e1208]">
                            <p className="text-[#86efac] text-[10px] mb-0.5">UPTIME</p>
                            <p className="text-[#fde6b3] font-black">{fmtUptime(hostInfo)}</p>
                          </div>
                        </div>

                        {/* Lobby open/closed status + action */}
                        {lobbyIsOpen && amIHost && (
                          <div className="flex items-center justify-center gap-2 bg-[#14532d]/40 border border-[#4ade80]/40 rounded-lg py-3 px-4">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#4ade80] shadow-[0_0_10px_rgba(74,222,128,0.9)] animate-pulse" />
                            <span className="text-[#4ade80] font-black text-sm tracking-widest">LOBBY OPEN — Friends can now join!</span>
                          </div>
                        )}
                        {lobbyIsOpen && !amIHost && (
                          <div className="text-center py-2">
                            <p className="text-[10px] text-[#fca5a5] font-semibold text-center mb-2"> Lobby is already open by another player.</p>
                            <button
                              onClick={() => { setLobbyMode('join'); setLobbyError(''); setJoinInfo(null); setJoinError(''); }}
                              className="w-full bg-[#0369a1] hover:bg-[#0284c7] active:bg-[#075985] text-white border-b-[4px] border-[#075985] active:border-b-0 active:translate-y-[4px] font-pixelify tracking-widest py-3 rounded-xl text-lg transition-all shadow-[0_0_15px_rgba(3,105,161,0.4)]"
                            >
                              JOIN EXISTING LOBBY ➔
                            </button>
                          </div>
                        )}
                        {!lobbyIsOpen && (
                          <>
                            <p className="text-[10px] text-[#fca5a5] text-center font-semibold"> Lobby is closed — friends cannot join yet.</p>
                            <button
                              onClick={openLobby}
                              disabled={isOpening}
                              className="w-full bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] disabled:opacity-60 text-[#fde6b3] border-b-[4px] border-[#92400e] active:border-b-0 active:translate-y-[4px] font-pixelify tracking-widest py-3 rounded-xl text-lg transition-all shadow-[0_0_15px_rgba(217,119,6,0.4)]"
                            >
                              {isOpening ? 'Opening...' : '🔓 OPEN LOBBY'}
                            </button>
                            <p className="text-[10px] text-[#d4b483] italic text-center">You must open the lobby before friends can join.</p>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-2">
                        <p className="text-xs text-[#fca5a5] font-mono">Could not detect local server.</p>
                        <p className="text-[10px] text-[#d4b483] mt-1">Make sure <code className="bg-[#1e1208] px-1 rounded">python3 runserver.py</code> is running.</p>
                        <button onClick={pingLocalServer} className="mt-3 text-xs bg-[#3e240f] hover:bg-[#523315] text-[#d4b483] px-4 py-1.5 rounded-lg border border-[#2e1d0d] transition-colors">
                          Retry
                        </button>
                      </div>
                    )}
                  </div>

                  {PlayerSetup}

                  {!ws && (
                    <div className="flex gap-4">
                      <button onClick={() => setView('TITLE')}
                        className="flex-1 bg-[#5c3e21] hover:bg-[#3e240f] text-[#d4b483] border-b-[4px] border-[#3e240f] active:border-b-0 active:translate-y-[4px] font-pixelify tracking-wider px-6 py-4 rounded-xl text-xl transition-all">
                        ← BACK
                      </button>
                      <button onClick={() => setShouldConnect(true)} disabled={!hostInfo || !lobbyIsOpen || !amIHost || selectedRoleTaken}
                        className="flex-grow-[2] bg-[#4ade80] hover:bg-[#22c55e] active:bg-[#16a34a] disabled:bg-[#3e240f] disabled:text-[#6b4c2a] disabled:cursor-not-allowed text-[#064e3b] border-b-[4px] border-[#16a34a] active:border-b-0 active:translate-y-[4px] font-pixelify tracking-widest px-8 py-4 rounded-xl text-xl transition-all shadow-[0_0_20px_rgba(74,222,128,0.4)]">
                        {!hostInfo ? 'SERVER NOT FOUND' : selectedRoleTaken ? 'CHANGE ROLE FIRST' : (!lobbyIsOpen || !amIHost) ? '🔒 WAIT FOR HOST' : 'START AS HOST ➔'}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* ─── JOIN SERVER mode ─── */
                <>
                  <div className="bg-[#3e240f] border-[3px] border-[#2e1d0d] rounded-xl p-4 flex flex-col gap-3">
                    <h2 className="text-xs font-black text-[#38bdf8] tracking-widest">🔗 ENTER SERVER ADDRESS</h2>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={joinIp}
                        onChange={(e) => { setJoinIp(e.target.value); setJoinInfo(null); setJoinError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && pingJoinServer(joinIp)}
                        placeholder="Ask your friend for their IP →"
                        className="flex-1 min-w-0 bg-[#2e1d0d] border-[3px] border-[#1e1208] rounded px-3 py-2 text-sm font-mono text-[#4ade80] placeholder-[#784f2b] focus:outline-none focus:border-[#38bdf8] transition-colors shadow-inner"
                      />
                      <button onClick={() => pingJoinServer(joinIp)} disabled={isJoinPinging || !joinIp.trim()}
                        className="bg-[#0369a1] hover:bg-[#0284c7] active:bg-[#075985] text-white font-black px-4 py-2 rounded-lg text-xs transition-colors disabled:opacity-50 border-b-[3px] border-[#075985] active:border-b-0 active:translate-y-[3px]">
                        {isJoinPinging ? '⏳...' : 'PING'}
                      </button>
                    </div>
                    {joinError && <p className="text-xs text-[#fca5a5] font-mono">{joinError}</p>}
                    {!joinInfo && !isJoinPinging && !joinError && (
                      <p className="text-[10px] text-[#d4b483] italic">Ask your friend for their IP from the &quot;Create Lobby&quot; tab, then enter it here and press PING.</p>
                    )}
                    {joinInfo && (
                      <div className="bg-[#1e1208] rounded-lg p-3 border-2 border-[#38bdf8]/30 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-mono">
                        <span className="text-[#86efac]">Status</span>
                        <span className={`font-bold flex items-center gap-1 ${joinInfo.open ? 'text-[#4ade80]' : 'text-[#fca5a5]'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${joinInfo.open ? 'bg-[#4ade80] animate-pulse' : 'bg-[#fca5a5]'}`} />
                          {joinInfo.open ? 'Open' : '🔒 Lobby Closed'}
                        </span>
                        <span className="text-[#86efac]">Server IP</span>
                        <span className="text-[#fde6b3] font-bold">{joinInfo.server_ip}</span>
                        <span className="text-[#86efac]">Players</span>
                        <span className="text-[#fde6b3] font-bold">{joinInfo.players_online} online</span>
                        <span className="text-[#86efac]">Level Progress</span>
                        <span className="text-[#fde6b3] font-bold">{joinInfo.room_number} / 5</span>
                      </div>
                    )}
                    {joinInfo && !joinInfo.open && (
                      <p className="text-xs text-[#fca5a5] font-semibold text-center">🔒 The host hasn&apos;t opened the lobby yet. Ask them to click &quot;Open Lobby&quot; in the Create Lobby tab.</p>
                    )}
                  </div>

                  {PlayerSetup}

                  {!ws && (
                    <div className="flex gap-4">
                      <button onClick={() => setView('TITLE')}
                        className="flex-1 bg-[#5c3e21] hover:bg-[#3e240f] text-[#d4b483] border-b-[4px] border-[#3e240f] active:border-b-0 active:translate-y-[4px] font-pixelify tracking-wider px-6 py-4 rounded-xl text-xl transition-all">
                        ← BACK
                      </button>
                      <button onClick={() => setShouldConnect(true)} disabled={!joinInfo || !joinInfo.open || selectedRoleTaken}
                        className="flex-grow-[2] bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] disabled:bg-[#5c3e21] disabled:text-[#6b4c2a] disabled:border-[#3e240f] disabled:cursor-not-allowed text-[#fde6b3] border-b-[4px] border-[#92400e] active:border-b-0 active:translate-y-[4px] font-pixelify tracking-widest px-8 py-4 rounded-xl text-xl transition-all shadow-[0_0_20px_rgba(217,119,6,0.4)]">
                        {!joinInfo ? 'PING FIRST...' : selectedRoleTaken ? 'CHANGE ROLE FIRST' : !joinInfo.open ? '🔒 LOBBY CLOSED' : 'JOIN SERVER ➔'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* RIGHT COLUMN: Waiting Room */}
            <div className="flex flex-col gap-4 flex-1 border-t-4 lg:border-t-0 lg:border-l-4 border-[#3e240f] lg:pl-5 pt-5 lg:pt-0">
              {!ws ? (
                <div className="bg-[#3e240f] border-[3px] border-[#2e1d0d] rounded-xl p-4 flex flex-col items-center justify-center gap-3 h-full min-h-[250px] opacity-50">
                  <span className="text-4xl grayscale">😴</span>
                  <p className="text-[#d4b483] font-bold text-sm tracking-widest text-center">WAITING ROOM OFFLINE</p>
                  <p className="text-[#a8825b] text-xs text-center px-4">Open the lobby or join a server to connect.</p>
                </div>
              ) : (
                <div className="bg-[#3e240f] border-[3px] border-[#2e1d0d] rounded-xl p-4 flex flex-col gap-3 animate-fade-in h-full">
                  {lobbyMode === 'join' && (
                    <h2 className="text-[#38bdf8] text-xs font-black tracking-widest border-b-2 border-[#523315] pb-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse"></span>
                      WAITING FOR HOST TO START...
                    </h2>
                  )}
                  <h2 className="text-[#4ade80] text-xs font-black tracking-widest border-b-2 border-[#523315] pb-2 flex items-center justify-between">
                    <span>CONNECTED RAIDERS ({onlineCount})</span>
                    <button onClick={() => { setWs(null); setShouldConnect(false); window.location.reload(); }} className="text-[#d4b483] hover:text-[#fca5a5] text-[10px]">Disconnect</button>
                  </h2>

                  {/* Role coordination panel */}
                  <div className="flex flex-col gap-1.5">
                    {gameState?.players?.map((p: any) => {
                      const pClass = p.name.split('|')[1] || 'Player';
                      const isMe = p.id === myId;
                      const isDead = p.lives !== undefined && p.lives <= 0;
                      const badgeLabel = getRoleBadgeLabel(pClass);
                      return (
                        <div key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border ${
                          isMe
                            ? 'bg-[#1e3a2e] border-[#4ade80]/40'
                            : 'bg-[#2e1d0d] border-[#1e1208]'
                        }`}>
                          <span className="text-base shrink-0">
                            {pClass === 'Wizard' ? '🧙' : pClass === 'Archer' ? '🏹' : '⚔️'}
                          </span>
                          <span className={`font-bold text-sm truncate ${ isDead ? 'text-[#ef4444]' : 'text-[#fde6b3]' }`}>
                            {p.name.split('|')[0]}
                          </span>
                          <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded font-black tracking-wider shrink-0 ${
                            pClass === 'Wizard'
                              ? 'bg-[#1e3a5f] text-[#38bdf8] border border-[#38bdf8]/40'
                              : pClass === 'Swordsman'
                                ? 'bg-[#3e240f] text-[#f59e0b] border border-[#f59e0b]/40'
                                : 'bg-[#3b1f1f] text-[#f87171] border border-[#f87171]/40'
                          }`}>
                            {badgeLabel}
                          </span>
                          {isMe && <span className="text-[9px] bg-[#3b82f6] text-white px-1.5 py-0.5 rounded font-bold shrink-0">YOU</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Role slots summary */}
                  <div className="bg-[#2e1d0d] rounded-lg p-2 border border-[#1e1208] text-[10px] font-mono flex flex-col gap-1">
                    <p className="text-[#d4b483] font-black tracking-widest">ROLE SLOTS</p>
                    <div className="flex gap-3 flex-wrap">
                      {ROLE_OPTIONS.map((r) => {
                        const filled = gameState?.players?.some((p: any) => p.name.endsWith(`|${r.value}`));
                        return (
                          <span key={r.value} className={filled ? 'text-[#4ade80] font-bold' : 'text-[#5c3e21]'}>
                            {r.icon} {r.value}: {filled ? 'FILLED' : 'EMPTY'}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {lobbyMode === 'create' && (
                    <button onClick={() => ws?.send(JSON.stringify({ type: "start_game" }))}
                      className="w-full mt-1 bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] text-[#fde6b3] border-b-[6px] border-[#92400e] active:border-b-0 active:translate-y-[6px] font-pixelify tracking-widest px-6 py-4 rounded-xl text-3xl transition-all shadow-[0_0_20px_rgba(217,119,6,0.4)]">
                      START ADVENTURE!
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
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
  const gamePhase = gameState?.game_phase || "LOBBY";

  if (view === 'GAME') {
    if (gamePhase === "JOURNEY_MAP") {
      const levels = [1, 2, 3, 4, 5];
      return (
        <div className={`h-full w-full bg-[#1b3d1b] flex flex-col items-center justify-center font-sans relative ${useCRT ? 'crt' : ''} overflow-hidden`}>
          {/* Map Background Pattern */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000_100%),repeating-linear-gradient(45deg,_#784f2b_0%,_#784f2b_2px,_transparent_2px,_transparent_10px)]"></div>
          
          <div className="bg-[#5c3e21]/90 backdrop-blur-sm border-[6px] border-[#3e240f] rounded-3xl p-10 shadow-[0_0_50px_rgba(0,0,0,0.8)] max-w-4xl w-full flex flex-col items-center relative z-10">
            <h1 className="text-6xl font-pixelify text-[#facc15] tracking-widest drop-shadow-[0_4px_10px_rgba(250,204,21,0.5)] text-center mb-12 border-b-[4px] border-[#3e240f] pb-4 px-8 inline-block">
              DUNGEON MAP
            </h1>
            
            <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-0 w-full mb-8">
              {levels.map((lvl, index) => {
                const isActive = lvl === roomNum;
                const isPast = lvl < roomNum;
                const isBoss = lvl === 5;
                return (
                  <div key={lvl} className="flex flex-col md:flex-row items-center relative">
                    {/* Node */}
                    <div className="relative flex flex-col items-center">
                      {isActive && (
                        <div className="absolute -inset-4 bg-[#facc15]/20 rounded-full animate-ping"></div>
                      )}
                      <div className={`w-20 h-20 rounded-xl border-[6px] flex items-center justify-center text-3xl font-black font-pixelify relative shadow-[0_10px_20px_rgba(0,0,0,0.5)] transform transition-transform duration-500 ${
                        isActive ? 'bg-[#d97706] border-[#facc15] text-white scale-110 z-20 animate-pulse rotate-3' : 
                        isPast ? 'bg-[#2e1d0d] border-[#4ade80] text-[#16a34a] rotate-0 grayscale opacity-80' : 
                        'bg-[#3e240f] border-[#2e1d0d] text-[#5c3e21]'
                      }`}>
                        {isPast ? '✔' : isBoss ? '☠' : lvl}
                      </div>
                      
                      {/* Label */}
                      <div className={`mt-4 font-bold tracking-widest px-3 py-1 rounded border-2 shadow-inner ${
                        isActive ? 'bg-[#facc15] text-[#3e240f] border-[#d97706]' : 
                        isPast ? 'bg-[#16a34a] text-[#064e3b] border-[#4ade80]' : 
                        'bg-[#2e1d0d] text-[#784f2b] border-[#1e1208]'
                      }`}>
                        {isBoss ? 'BOSS' : `LEVEL ${lvl}`}
                      </div>
                    </div>

                    {/* Pathing line */}
                    {index < levels.length - 1 && (
                      <div className="h-12 w-2 md:h-2 md:w-16 lg:w-24 flex items-center justify-center relative my-2 md:my-0">
                        {/* Background dashed line */}
                        <div className="absolute w-full h-full border-l-[4px] md:border-l-0 md:border-t-[4px] border-dashed border-[#3e240f]"></div>
                        {/* Animated fill line if past */}
                        {isPast && (
                          <div className="absolute left-0 top-0 w-full h-full bg-[#4ade80] shadow-[0_0_10px_rgba(74,222,128,0.8)]"></div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-8 bg-[#2e1d0d] border-[3px] border-[#1e1208] p-4 rounded-xl flex items-center gap-4">
              <div className="w-6 h-6 border-4 border-t-[#4ade80] border-[#3e240f] rounded-full animate-spin"></div>
              <p className="text-xl font-bold text-[#fde6b3] tracking-widest animate-pulse">PREPARING LEVEL {roomNum}...</p>
            </div>
          </div>
        </div>
      );
    }

    if (gamePhase === "LEVEL_COMPLETE") {
      return (
        <div className={`h-full w-full bg-[#1b3d1b] flex flex-col items-center justify-center font-sans ${useCRT ? 'crt' : ''}`}>
          <div className="text-center animate-[bounce_2s_ease-in-out_infinite]">
            <h1 className="text-6xl md:text-8xl font-pixelify text-[#4ade80] tracking-widest drop-shadow-[0_5px_15px_rgba(74,222,128,0.6)]">
              LEVEL {roomNum} COMPLETE!
            </h1>
            <p className="mt-4 text-[#fde6b3] text-2xl font-bold tracking-widest">Portal activated...</p>
          </div>
        </div>
      );
    }

    if (gamePhase === "VICTORY") {
      return (
        <div className={`h-full w-full bg-[#1b3d1b] flex flex-col items-center justify-center font-sans ${useCRT ? 'crt' : ''} bg-scrolling-grid`}>
          <div className="text-center">
            <h1 className="text-7xl md:text-9xl font-pixelify text-[#facc15] tracking-widest drop-shadow-[0_5px_15px_rgba(250,204,21,0.6)] animate-pulse">
              VICTORY!
            </h1>
            <p className="mt-6 text-[#fde6b3] text-2xl font-bold tracking-widest bg-[#5c3e21] p-4 rounded-xl border-[4px] border-[#3e240f]">
              All levels cleared. The database is safe!
            </p>
          </div>
        </div>
      );
    }
  }

  return (
    <div className={`h-full w-full bg-[#1b3d1b] overflow-hidden ${useCRT ? 'crt relative' : ''}`}>
      <div className="w-full h-full p-3 md:p-5 text-[#fde6b3] font-sans flex flex-row gap-5 relative z-10">
        
        {/* ── LEFT COLUMN (Data & Context) ────────────────── */}
        <div className="flex flex-col w-[280px] lg:w-[320px] gap-3 shrink-0 h-full overflow-y-auto custom-scrollbar pr-1 pb-2">
          
          {/* Room Header */}
          <div className="bg-[#5c3e21] border-[6px] border-[#3e240f] rounded-2xl p-3 shadow-[inset_0_0_10px_rgba(0,0,0,0.5),0_6px_12px_rgba(0,0,0,0.5)] shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold bg-[#3e240f]/60 px-2.5 py-0.5 rounded border border-[#3e240f]">LEVEL {roomNum}/5</span>
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
            <span></span> MISSION OBJECTIVE
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

        {/* Table Schema Preview */}
        <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-xl p-3 shadow-inner shrink-0">
          <h2 className="text-sm font-black text-[#ffdb7a] tracking-wider mb-2 flex items-center gap-1.5 drop-shadow-sm">
            <span></span> TABLE SCHEMA
          </h2>
          <div className="bg-[#523315] rounded border-[2px] border-[#3e240f] shadow-inner overflow-hidden">
            <div className="bg-[#3e240f] border-b-[2px] border-[#2e1d0d] px-3 py-1.5 flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-[#fde6b3]">{schemaInfo.table_name ?? roomName}</span>
              <span className="text-[10px] font-bold text-[#facc15]">preview</span>
            </div>
            <div className="overflow-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-[2px] border-[#3e240f] bg-[#523315]">
                    {schemaColumns.map((col: string) => (
                      <th key={col} className="px-2 py-1.5 text-left font-bold text-[#facc15] whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schemaPreviewRows.map((row: any[], i: number) => (
                    <tr key={i} className="border-b-[1px] border-[#3e240f]/50">
                      {row.map((cell: any, j: number) => (
                        <td key={j} className="px-2 py-1 font-mono text-[#fde6b3] whitespace-nowrap">{String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[#fde6b3]/70 mt-2 font-semibold">
            Preview shows 2 rows. Full live table appears after a successful Wizard query.
          </p>
        </div>

        {/* Query Results — only shown after Wizard runs a query */}
        {queryResult && queryResult.success && queryResult.columns?.length > 0 && (
          <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-xl p-3 flex flex-col shadow-inner overflow-hidden flex-1 min-h-[200px]">
            <h2 className="text-sm font-black text-[#ffdb7a] tracking-wider mb-2 flex items-center gap-1.5 drop-shadow-sm shrink-0">
              <span>🗃️</span> QUERY RESULT
              {queryResult.queried_by && (
                <span className="ml-auto text-[9px] text-[#38bdf8] font-bold">🧙 {queryResult.queried_by}</span>
              )}
            </h2>
            <div className="bg-[#523315] rounded border-[2px] border-[#3e240f] shadow-inner flex flex-col overflow-hidden h-full">
              <div className="bg-[#3e240f] border-b-[2px] border-[#2e1d0d] px-3 py-1.5 shrink-0 flex justify-between items-center">
                <span className="text-xs font-mono font-bold text-[#fde6b3] drop-shadow-sm">
                  {schemaInfo.table_name ?? "result"}
                </span>
                <span className="text-[10px] font-bold text-[#facc15]">{queryResult.rows.length} rows</span>
              </div>
              <div className="overflow-auto bg-[#8c5f36]/10 flex-1 custom-scrollbar">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-[2px] border-[#3e240f] sticky top-0 bg-[#523315] z-10">
                      {queryResult.columns.map((col: string) => (
                        <th key={col} className="px-2 py-1.5 text-left font-bold text-[#facc15] whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row: any[], i: number) => (
                      <tr key={i} className="border-b-[1px] border-[#3e240f]/50 hover:bg-[#3e240f]/30">
                        {row.map((cell: any, j: number) => (
                          <td key={j} className="px-2 py-1 font-mono text-[#fde6b3] whitespace-nowrap">{String(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── CENTER COLUMN (Canvas) ─────────────────────── */}
      <div className="flex flex-col w-full flex-1 h-full min-w-0 border-[6px] border-[#3e240f] rounded-2xl overflow-hidden shadow-[0_0_15px_rgba(0,0,0,0.5)] relative">
        <GameCanvas
          ws={ws}
          gameState={gameState}
          myId={myId}
          attacks={attacks}
          onRequestQuit={() => setShowQuitConfirm(true)}
          inputLocked={isWizardTerminalOpen}
        />
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
        <div className={`border-[6px] rounded-2xl p-3 flex flex-col shrink-0 relative transition-colors duration-200 ${
          isWizardTerminalOpen
            ? 'bg-[#523315] border-[#2e1d0d] shadow-[inset_0_0_0_rgba(0,0,0,0.0),0_6px_12px_rgba(0,0,0,0.45)]'
            : 'bg-[#5c3e21] border-[#3e240f] shadow-[inset_0_0_10px_rgba(0,0,0,0.5),0_6px_12px_rgba(0,0,0,0.5)]'
        }`}>
          <h2 className={`text-sm font-black tracking-wider mb-2 flex items-center gap-1.5 drop-shadow-sm transition-colors ${
            isWizardTerminalOpen ? 'text-[#d4b483]' : 'text-[#4ade80]'
          }`}>
            <span></span> TERMINAL
            {canQuery ? (
              <span className={`ml-auto text-[9px] border px-1.5 py-0.5 rounded font-black tracking-widest transition-colors ${
                isWizardTerminalOpen
                  ? 'bg-[#3e240f] text-[#d4b483] border-[#2e1d0d]'
                  : 'bg-[#1e3a5f] text-[#38bdf8] border-[#38bdf8]/40'
              }`}>🔍 QUERY PLAYER</span>
            ) : (
              <span className="ml-auto text-[9px] bg-[#3b1f1f] text-[#f87171] border border-[#f87171]/40 px-1.5 py-0.5 rounded font-black tracking-widest">⚔ READ-ONLY</span>
            )}
          </h2>

          {!canQuery ? (
            /* Non-Wizard locked view */
            <div className="bg-[#2e1d0d] border-2 border-[#3e240f] rounded-lg px-3 py-4 flex flex-col items-center gap-2 text-center">
              <span className="text-2xl">🧙</span>
              <p className="text-[#d4b483] text-xs font-bold tracking-wide">Only the <span className="text-[#38bdf8]">current QUERY role holder</span> can query the database.</p>
              <p className="text-[#6b4c2a] text-[10px]">If roles transfer after a teammate quits, this terminal unlocks automatically.</p>
            </div>
          ) : (
            /* Wizard terminal launcher */
            <div className="flex flex-col gap-2 mb-2">
              <button
                type="button"
                onClick={() => setShowSqlModal(true)}
                className="w-full bg-[#2e1d0d] border-[3px] border-[#1e1208] rounded px-3 py-2 text-sm font-mono text-left text-[#4ade80] hover:border-[#4ade80] transition-colors shadow-inner flex items-center gap-2"
              >
                <span className="text-[#4ade80] font-bold">»</span>
                <span className="truncate">{sqlPreview}</span>
              </button>
              <button
                onClick={() => setShowSqlModal(true)}
                className="bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] text-[#fde6b3] border-b-[4px] border-[#92400e] active:border-b-0 active:translate-y-[4px] font-black tracking-wider px-3 py-2 rounded-lg text-sm transition-all focus:outline-none"
              >
                OPEN SQL EDITOR
              </button>
            </div>
          )}

          {showSqlModal && canQuery && (
            <div className="absolute inset-0 z-30 bg-[#5c3e21] border-[4px] border-[#3e240f] rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.6)] overflow-hidden">
              <div className="bg-[#5c3e21] border-b-[3px] border-[#3e240f] px-3 py-2 flex items-center gap-2">
                <h3 className="text-[11px] font-black tracking-widest text-[#4ade80]">WIZARD SQL TERMINAL</h3>
                <span className="text-[9px] text-[#d4b483] font-bold ml-auto">SQL</span>
                <button
                  onClick={() => sendQuery()}
                  className="bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] text-[#fde6b3] border-b-[3px] border-[#92400e] active:border-b-0 active:translate-y-[3px] font-black tracking-wide px-2.5 py-1 rounded text-[10px] transition-all"
                >
                  RUN
                </button>
                <button
                  onClick={() => setShowSqlModal(false)}
                  className="bg-[#5c3e21] hover:bg-[#3e240f] text-[#d4b483] border-b-[3px] border-[#3e240f] active:border-b-0 active:translate-y-[3px] font-black tracking-wide px-2.5 py-1 rounded text-[10px] transition-all"
                >
                  CLOSE
                </button>
              </div>
              <div className="h-[170px] bg-[#2e1d0d]">
                <Editor
                  language="sql"
                  beforeMount={configureSqlTheme}
                  theme="data-raiders-sql"
                  value={sqlInput}
                  onChange={(value) => setSqlInput(value ?? "")}
                  loading={null}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineHeight: 20,
                  wordWrap: "on",
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  lineNumbersMinChars: 2,
                  lineDecorationsWidth: 8,
                  glyphMargin: false,
                  folding: false,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
                }}
              />
            </div>
          </div>
          )}

          {queryResult && !queryResult.success && (
            <p className="text-xs text-red-400 font-mono mt-1">Error: {queryResult.message}</p>
          )}
          {queryResult?.success && queryResult.queried_by && !canQuery && (
            <p className="text-[10px] text-[#38bdf8] font-bold mt-1">🧙 Intel from {queryResult.queried_by}</p>
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
                {m.replace(/^[✅❌🔍📊⚡👋⚔⟳]\s*/u, "")}
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
              <h3 className="text-2xl font-pixelify text-[#4ade80] tracking-wider mb-2 drop-shadow-md">GUIDE · {roleTutorial.badge}</h3>
              <p className="text-[#fde6b3] font-bold text-lg md:text-xl leading-relaxed">
                {tutorialStep === 1 && roleTutorial.step1}
                {tutorialStep === 2 && "This is the Game Canvas. Use [W][A][S][D] to move around. If you want to inspect an enemy's data, just click on them with your mouse to lock on!"}
                {tutorialStep === 3 && "This Left Panel is your Intel Screen! The MISSION OBJECTIVE tells you exactly which enemies you need to eliminate to unlock the portal. The TABLE SCHEMA reveals the exact column names of the database you'll need for your spells!"}
                {tutorialStep === 4 && roleTutorial.step4}
                {tutorialStep === 5 && roleTutorial.step5}
                {tutorialStep === 6 && roleTutorial.step6}
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
                onClick={() => {
                  setShowQuitConfirm(false);
                  leaveLobby();
                  setView('TITLE');
                }}
                className="flex-1 bg-[#ef4444] hover:bg-[#dc2626] active:bg-[#b91c1c] text-[#fde6b3] border-b-[4px] border-[#b91c1c] active:border-b-0 active:translate-y-[4px] font-bold py-3 rounded-lg transition-all text-sm shadow-[0_0_10px_rgba(239,68,68,0.5)]"
              >
                QUIT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DEATH OVERLAY ──────────────────────────────────────── */}
      {showDeathScreen && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-red-950/70 animate-[fadeIn_0.3s_ease-out]" />
          <div className="relative flex flex-col items-center gap-4">
            <p
              className="text-[#ff2222] font-pixelify text-8xl md:text-9xl tracking-widest drop-shadow-[0_0_40px_rgba(255,34,34,0.9)] animate-[deathPulse_0.6s_ease-in-out_infinite_alternate]"
              style={{ textShadow: '0 0 60px #ff0000, 0 0 120px #ff0000' }}
            >
              OOF
            </p>
            <p
              className="text-[#ff6666] font-pixelify text-4xl md:text-5xl tracking-widest drop-shadow-[0_0_20px_rgba(255,34,34,0.8)] animate-[deathPulse_0.6s_ease-in-out_0.15s_infinite_alternate]"
            >
              YOU DIED!
            </p>
            <p className="text-[#fca5a5] font-bold text-lg mt-4 animate-pulse tracking-widest">
              Respawning in {deathCountdown} seconds...
            </p>
          </div>
        </div>
      )}

      {/* ── GAME OVER OVERLAY ──────────────────────────────────────── */}
      {showGameOver && (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center bg-black/95 animate-[fadeIn_0.5s_ease-out]">
          <div className="flex flex-col items-center gap-6 text-center px-8">
            <p className="text-9xl animate-[deathPulse_1s_ease-in-out_infinite_alternate]">💀</p>
            <p
              className="text-[#ff2222] font-pixelify text-7xl md:text-8xl tracking-widest"
              style={{ textShadow: '0 0 40px #ff0000, 0 0 80px #660000' }}
            >
              GAME OVER
            </p>
            <p className="text-[#fca5a5] font-pixelify text-2xl md:text-3xl tracking-widest animate-pulse">
              YOU LOST ALL YOUR HEARTS
            </p>
            <div className="flex gap-3 mt-1">
              {[1,2,3].map(i => (
                <span key={i} className="text-4xl grayscale opacity-30">❤️</span>
              ))}
            </div>
            <p className="text-[#d4b483] font-semibold text-sm tracking-wider">
              Better luck next time, Raider.
            </p>
            <button
              onClick={async () => {
                setShowGameOver(false);
                setShowDeathScreen(false);
                await leaveLobby();
                setView('LOBBY');
              }}
              className="mt-4 bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] text-white font-pixelify tracking-widest px-10 py-5 rounded-2xl text-2xl border-b-[6px] border-[#991b1b] active:border-b-0 active:translate-y-[6px] transition-all shadow-[0_0_30px_rgba(220,38,38,0.5)]"
            >
              ← BACK TO LOBBY
            </button>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
