import { useEffect, useState, useRef } from "react";
import GameCanvas from "./GameCanvas";
import "./index.css";

export default function App() {
  const [messages, setMessages] = useState<string[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [sqlInput, setSqlInput] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [onlineCount, setOnlineCount] = useState(1);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [attacks, setAttacks] = useState<Record<string, number>>({});
  const [playerName] = useState(
    () => "Player_" + Math.floor(Math.random() * 1000)
  );

  const myIdRef = useRef<string | null>(null);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const loc = window.location;
    const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${loc.hostname}:8000/ws`;
    const socket = new WebSocket(url);

    socket.onopen = () => {
      setWs(socket);
      socket.send(JSON.stringify({ type: "join", player_name: playerName }));
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
          setMessages((m) => [...m, `⚡ ${msg.player_name} joined!`]);
          break;
        case "player_left":
          setMessages((m) => [...m, `👋 Player ${(msg.player_id || "?").slice(0, 4)} left.`]);
          break;
        case "chat":
          setMessages((m) => [...m, `${msg.sender}: ${msg.text}`]);
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
  }, [playerName]);

  const sendChat = () => {
    if (!inputVal.trim() || !ws) return;
    ws.send(JSON.stringify({ type: "chat", text: inputVal, sender: playerName }));
    setMessages((m) => [...m, `You: ${inputVal}`]);
    setInputVal("");
  };

  const sendQuery = () => {
    if (!sqlInput.trim() || !ws) return;
    ws.send(JSON.stringify({ type: "query", sql: sqlInput }));
    setMessages((m) => [...m, `🔍 > ${sqlInput}`]);
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

  return (
    <div className="h-full w-full bg-gray-950 p-3 md:p-5 text-white font-sans flex flex-col md:flex-row gap-4">

      {/* ── LEFT COLUMN ─────────────────────────────────────── */}
      <div className="flex flex-col w-full md:w-[360px] gap-2 shrink-0 h-full pb-1 overflow-hidden">

        {/* Room Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-3 shadow-lg shadow-indigo-500/20">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold bg-white/20 px-2.5 py-0.5 rounded-full">ROOM {roomNum}/5</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse"></div>
              <span className="text-xs font-semibold text-white/80">{onlineCount} online</span>
            </div>
          </div>
          <h1 className="text-lg font-extrabold tracking-tight">{schemaInfo.table_name || roomName}</h1>
          {me && (
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="font-bold text-yellow-200">⭐ {me.score ?? 0} pts</span>
              <div className="flex items-center gap-1.5 flex-1">
                <span className="font-bold text-red-200">HP</span>
                <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${(me.hp / Math.max(1, me.max_hp)) > 0.4 ? "bg-green-400" : "bg-red-400"}`}
                    style={{ width: `${(me.hp / Math.max(1, me.max_hp)) * 100}%` }}
                  />
                </div>
                <span className="font-bold text-white/80">{me.hp}/{me.max_hp}</span>
              </div>
            </div>
          )}
        </div>

        {/* Mission Objective */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-3">
          <h2 className="text-xs font-extrabold text-amber-400 tracking-wider mb-2 flex items-center gap-1.5">
            <span></span> MISSION OBJECTIVE
          </h2>
          <p className="text-sm font-bold text-white leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
            {objective || "Loading..."}
          </p>
          {hint && (
            <p className="text-xs text-gray-400 mt-2 italic">
              💡 {hint}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {!gameState?.room_cleared ? (
              <span className="text-xs font-bold text-red-400">⚔ {gameState?.targets_remaining ?? enemies.length} targets remaining</span>
            ) : (
              <span className="text-xs font-bold text-green-400">✓ All clear — walk to the portal!</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {allowedSpells.map((sp: string) => (
              <span key={sp} className="text-[10px] font-bold bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full text-gray-300">
                {sp}
              </span>
            ))}
          </div>
        </div>

        {/* Schema Card */}
        {schemaInfo.columns && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-3 flex flex-col shrink">
            <h2 className="text-xs font-extrabold text-cyan-400 tracking-wider mb-2 flex items-center gap-1.5">
              <span></span> TABLE SCHEMA
            </h2>
            <div className="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
              <div className="bg-cyan-500/10 border-b border-gray-800 px-3 py-1.5">
                <span className="text-xs font-mono font-bold text-cyan-400">{schemaInfo.table_name}</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    {schemaInfo.columns.map((col: string) => (
                      <th key={col} className="px-2 py-1.5 text-left font-bold text-gray-400 bg-gray-900/50">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(schemaInfo.sample_data || []).map((row: any[], i: number) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      {row.map((cell: any, j: number) => (
                        <td key={j} className="px-2 py-1 font-mono text-gray-300">{String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={schemaInfo.columns.length} className="px-2 py-1 text-gray-500 text-center italic">...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SQL Terminal */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-3 flex flex-col shrink">
          <h2 className="text-xs font-extrabold text-green-400 tracking-wider mb-2 flex items-center gap-1.5">
            <span></span> SQL TERMINAL
          </h2>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-green-400 font-mono text-sm font-bold">$</span>
            <input
              type="text"
              value={sqlInput}
              onChange={(e) => setSqlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendQuery()}
              placeholder={`SELECT * FROM ${schemaInfo.table_name || roomName} WHERE ...`}
              className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs font-mono text-green-300 placeholder-gray-600 focus:outline-none focus:border-green-500/50 transition-colors"
            />
            <button
              onClick={sendQuery}
              className="bg-green-600 hover:bg-green-500 text-white font-bold px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer"
            >
              RUN
            </button>
          </div>
          {queryResult && queryResult.success && queryResult.columns?.length > 0 && (
            <div className="bg-gray-950 rounded-lg border border-gray-800 overflow-x-auto max-h-40 overflow-y-auto">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="border-b border-gray-700 sticky top-0 bg-gray-900">
                    {queryResult.columns.map((col: string) => (
                      <th key={col} className="px-2 py-1 text-left font-bold text-green-400">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResult.rows.map((row: any[], i: number) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      {row.map((cell: any, j: number) => (
                        <td key={j} className="px-2 py-1 text-gray-300">{String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {queryResult && !queryResult.success && (
            <p className="text-xs text-red-400 font-mono mt-1">Error: {queryResult.message}</p>
          )}
        </div>

        {/* Chat */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 flex flex-col p-3 flex-1 min-h-[120px]">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xs font-extrabold text-gray-400 tracking-wider flex items-center gap-1.5">
              <span>💬</span> CHAT & LOG
            </h2>
            <button
              onClick={() => setMessages([])}
              className="text-[10px] text-gray-400 font-bold bg-gray-800 hover:bg-gray-700 px-2.5 py-1 rounded-full transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-1 text-xs">
            {messages.length === 0 && (
              <p className="text-gray-600 text-[10px] text-center mt-6">No messages yet...</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`px-2.5 py-1.5 rounded-lg max-w-full break-words text-[11px] font-medium ${
                m.startsWith("✅") ? "bg-green-500/10 text-green-300" :
                m.startsWith("❌") ? "bg-red-500/10 text-red-300" :
                m.startsWith("🔍") ? "bg-blue-500/10 text-blue-300 font-mono" :
                m.startsWith("📊") ? "bg-purple-500/10 text-purple-300" :
                "bg-gray-800/50 text-gray-300"
              }`}>
                {m}
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
              className="flex-1 bg-gray-950 border border-gray-800 rounded-full px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-gray-600 transition-colors"
            />
            <button
              onClick={sendChat}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-3 py-1.5 rounded-full text-xs transition-colors cursor-pointer"
            >
              Send
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-2">
          <h2 className="text-[10px] font-extrabold text-gray-500 tracking-wider mb-2">CONTROLS</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400 font-semibold">
            <span><b className="text-white">WASD</b> move</span>
            <span><b className="text-white">1-5</b> spell</span>
            <span><b className="text-white">E</b> cast</span>
            <span><b className="text-white">R</b> reset</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN: Canvas ─────────────────────────────── */}
      <div className="flex flex-col w-full flex-1 h-full min-w-0">
        {/* Brief */}
        <div className="w-full bg-gray-900 rounded-t-2xl border border-b-0 border-gray-800 px-4 py-3 shrink-0">
          <pre className="text-gray-300 whitespace-pre-wrap font-mono leading-relaxed text-[11px] font-semibold">
            {brief || "Connecting..."}
          </pre>
        </div>
        <div className="bg-gray-900 rounded-b-2xl border border-gray-800 w-full flex-1 relative overflow-hidden min-h-[400px]">
          <GameCanvas ws={ws} gameState={gameState} myId={myId} attacks={attacks} />
        </div>
      </div>
    </div>
  );
}
