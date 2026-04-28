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

  useEffect(() => {
    setQueryResult(null);
  }, [roomNum]);

  return (
    <div className="h-full w-full bg-[#1b3d1b] p-3 md:p-5 text-[#fde6b3] font-sans flex flex-col md:flex-row gap-5">

      {/* ── LEFT COLUMN (Wooden Board styling) ────────────────── */}
      <div className="flex flex-col w-full md:w-[380px] gap-3 shrink-0 h-full pb-1 overflow-hidden">

        {/* Room Header */}
        <div className="bg-[#5c3e21] border-[6px] border-[#3e240f] rounded-2xl p-3 shadow-[inset_0_0_10px_rgba(0,0,0,0.5),0_6px_12px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold bg-[#3e240f]/60 px-2.5 py-0.5 rounded border border-[#3e240f]">ROOM {roomNum}/5</span>
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
        <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-xl p-3 shadow-inner">
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
            <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-xl p-3 flex flex-col shrink shadow-inner overflow-hidden max-h-[220px]">
              <h2 className="text-sm font-black text-[#ffdb7a] tracking-wider mb-2 flex items-center gap-1.5 drop-shadow-sm shrink-0">
                <span>🗃️</span> {showQuery ? "QUERY RESULT" : "TABLE SCHEMA"}
              </h2>
              <div className="bg-[#523315] rounded border-[2px] border-[#3e240f] shadow-inner flex flex-col overflow-hidden">
                <div className="bg-[#3e240f] border-b-[2px] border-[#2e1d0d] px-3 py-1.5 shrink-0 flex justify-between items-center">
                  <span className="text-xs font-mono font-bold text-[#fde6b3] drop-shadow-sm">
                    {schemaInfo.table_name}
                  </span>
                  {showQuery && (
                    <span className="text-[10px] font-bold text-[#facc15]">{rows.length} rows</span>
                  )}
                </div>
                <div className="overflow-auto bg-[#8c5f36]/10 flex-1 relative custom-scrollbar">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b-[2px] border-[#3e240f] sticky top-0 bg-[#523315]">
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

        {/* SQL Terminal */}
        <div className="bg-[#5c3e21] border-[6px] border-[#3e240f] rounded-2xl p-3 flex flex-col shrink shadow-[inset_0_0_10px_rgba(0,0,0,0.5),0_6px_12px_rgba(0,0,0,0.5)]">
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
              placeholder={`SELECT * FROM ${schemaInfo.table_name || roomName} ...`}
              className="flex-1 bg-[#2e1d0d] border-[3px] border-[#1e1208] rounded px-3 py-2 text-sm font-mono text-[#4ade80] placeholder-[#784f2b] focus:outline-none focus:border-[#4ade80] transition-colors shadow-inner"
            />
            <button
              onClick={sendQuery}
              className="bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] text-[#fde6b3] border-b-[4px] border-[#92400e] active:border-b-0 active:translate-y-[4px] font-black tracking-wider px-4 py-2 rounded-lg text-sm transition-all focus:outline-none"
            >
              RUN
            </button>
          </div>
          {/* The query result table is now merged into the Schema Card above */}
          {queryResult && !queryResult.success && (
            <p className="text-xs text-red-400 font-mono mt-1">Error: {queryResult.message}</p>
          )}
        </div>

        {/* Chat */}
        <div className="bg-[#784f2b] border-[4px] border-[#523315] rounded-xl flex flex-col p-3 flex-1 min-h-[120px] shadow-inner">
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
              <div key={i} className={`px-2.5 py-1.5 rounded-lg max-w-full break-words text-[11px] font-bold ${m.startsWith("✅") ? "bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/30" :
                  m.startsWith("❌") ? "bg-[#ef4444]/20 text-[#fca5a5] border border-[#ef4444]/30" :
                    m.startsWith("🔍") ? "bg-[#38bdf8]/20 text-[#bae6fd] border border-[#38bdf8]/30 font-mono" :
                      m.startsWith("📊") ? "bg-[#c084fc]/20 text-[#e9d5ff] border border-[#c084fc]/30" :
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
              className="flex-1 bg-[#2e1d0d] border-[2px] border-[#1e1208] rounded px-3 py-1.5 text-xs text-[#fde6b3] font-medium focus:outline-none focus:border-[#d97706] transition-colors shadow-inner"
            />
            <button
              onClick={sendChat}
              className="bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] text-[#fde6b3] font-bold px-4 py-1.5 rounded text-xs transition-colors cursor-pointer"
            >
              Send
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-[#5c3e21] border-[4px] border-[#3e240f] rounded-xl p-2 shadow-inner">
          <h2 className="text-[10px] font-black text-[#d4b483] tracking-wider mb-2">CONTROLS</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#fde6b3] font-semibold">
            <span><b className="text-[#ffdb7a]">WASD</b> move</span>
            <span><b className="text-[#ffdb7a]">1-5</b> spell</span>
            <span><b className="text-[#ffdb7a]">E</b> cast</span>
            <span><b className="text-[#ffdb7a]">R</b> reset</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN: Canvas ─────────────────────────────── */}
      <div className="flex flex-col w-full flex-1 h-full min-w-0">
        <div className="w-full flex-1 relative overflow-hidden min-h-[400px]">
          <GameCanvas ws={ws} gameState={gameState} myId={myId} attacks={attacks} />
        </div>
      </div>
    </div>
  );
}
