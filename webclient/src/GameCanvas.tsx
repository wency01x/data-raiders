import { useEffect, useRef, useState } from "react";
import archerIdle from './assets/Archer/Idle.png';
import swordsmanIdle from './assets/Swordsman/Idle.png';
import wizardIdle from './assets/Wizard/Idle.png';
import archerAtk from './assets/Archer/Attack_1.png';
import swordsmanAtk from './assets/Swordsman/Attack_1.png';
import wizardAtk from './assets/Wizard/Attack_1.png';
import portalSprite from './assets/35.png';

const TILE = 56;
const COLS = 16;
const ROWS = 12;

interface Props {
  ws: WebSocket | null;
  gameState: any;
  myId: string | null;
  attacks: Record<string, number>;
}

/* ── nearest-enemy helper ─────────────────────────────────────── */
function nearestEnemy(gs: any, myId: string | null): number | null {
  if (!gs || !myId) return null;
  const me = gs.players?.find((p: any) => p.id === myId);
  if (!me) return null;
  let best: number | null = null;
  let bestD = Infinity;
  for (const e of gs.enemies || []) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - me.x, e.y - me.y);
    if (d < bestD) { bestD = d; best = e.id; }
  }
  return bestD < TILE * 4 ? best : null;
}

/* ── rounded rect helper ──────────────────────────────────────── */
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ── colors ───────────────────────────────────────────────────── */
const SPELL_COLORS: Record<string, string> = {
  SELECT: "#3b82f6",
  DELETE: "#ef4444",
  INSERT: "#10b981",
  UPDATE: "#f59e0b",
  JOIN:   "#8b5cf6",
};
const SPELLS = ["SELECT", "DELETE", "INSERT", "UPDATE", "JOIN"] as const;

/* ── Character sprites ────────────────────────────────────────── */
const SPRITES: Record<string, HTMLImageElement> = {};
const SPRITES_ATK: Record<string, HTMLImageElement> = {};
if (typeof window !== "undefined") {
  [
    { name: 'Archer', idle: archerIdle, atk: archerAtk },
    { name: 'Swordsman', idle: swordsmanIdle, atk: swordsmanAtk },
    { name: 'Wizard', idle: wizardIdle, atk: wizardAtk },
  ].forEach(c => {
    const imgIdle = new Image(); imgIdle.src = c.idle;
    const imgAtk = new Image(); imgAtk.src = c.atk;
    SPRITES[c.name] = imgIdle;
    SPRITES_ATK[c.name] = imgAtk;
  });
}
const CHAR_CLASSES = ['Archer', 'Swordsman', 'Wizard'];

function getCharClass(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return CHAR_CLASSES[Math.abs(hash) % CHAR_CLASSES.length];
}

/* ── Build a short display line from enemy extra data ─────────── */
function getEnemySubtext(e: any): string {
  const parts: string[] = [];
  if (e.status) parts.push(e.status);
  if (e.dept) parts.push(e.dept);
  if (e.role) parts.push(e.role);
  if (e.salary) parts.push(`$${(e.salary / 1000).toFixed(0)}k`);
  if (e.manager_id !== undefined && e.manager_id !== null) parts.push(`mgr:${e.manager_id || 'NULL'}`);
  if (e.weakness) parts.push(e.weakness);
  if (e.phase) parts.push(`P${e.phase}`);
  return parts.join(" | ");
}

export default function GameCanvas({ ws, gameState, myId, attacks }: Props) {
  const portalImg = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = portalSprite;
    img.onload = () => portalImg.current = img;
  }, []);

  const changingRoomRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => { wsRef.current = ws; }, [ws]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spell, setSpell] = useState<string>("DELETE");

  const spellRef = useRef(spell);
  useEffect(() => { spellRef.current = spell; }, [spell]);

  const gsRef = useRef<any>(null);
  useEffect(() => { gsRef.current = gameState; }, [gameState]);

  const idRef = useRef<string | null>(null);
  useEffect(() => { idRef.current = myId; }, [myId]);

  const atkRef = useRef<Record<string, number>>({});
  useEffect(() => { atkRef.current = attacks; }, [attacks]);

  const prevXRef = useRef<Record<string, number>>({});
  const facingRef = useRef<Record<string, number>>({});

  const keys = useRef<Record<string, boolean>>({});

  /* ── keyboard ─────────────────────────────────────────────── */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      keys.current[e.key.toLowerCase()] = true;

      if (e.key >= "1" && e.key <= "5") setSpell(SPELLS[+e.key - 1]);

      if (e.key.toLowerCase() === "e" && wsRef.current?.readyState === WebSocket.OPEN) {
        const tid = nearestEnemy(gsRef.current, idRef.current);
        wsRef.current.send(JSON.stringify({ type: "spell", spell: spellRef.current, target_id: tid }));
      }
      if (e.key.toLowerCase() === "r" && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "reset" }));
      }
    };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  /* ── movement at 30 fps ───────────────────────────────────── */
  useEffect(() => {
    const iv = setInterval(() => {
      const currentWs = wsRef.current;
      if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
      let dx = 0, dy = 0;
      const k = keys.current;
      if (k["a"] || k["arrowleft"])  dx -= 1;
      if (k["d"] || k["arrowright"]) dx += 1;
      if (k["w"] || k["arrowup"])    dy -= 1;
      if (k["s"] || k["arrowdown"]) dy += 1;
      if (dx || dy) currentWs.send(JSON.stringify({ type: "move", dx, dy }));
    }, 1000 / 30);
    return () => clearInterval(iv);
  }, []);

  /* ── render loop ──────────────────────────────────────────── */
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d")!;
    let raf = 0;

    const draw = () => {
      const W = cvs.width, H = cvs.height;
      const gs = gsRef.current;
      const currentMyId = idRef.current;
      const currentSpell = spellRef.current;
      const tid = nearestEnemy(gs, currentMyId);

      // Dark background
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      const ox = Math.max(0, (W - COLS * TILE) / 2);
      const oy = Math.max(0, (H - 50 - ROWS * TILE) / 2);
      ctx.translate(ox, oy);

      // Floor tiles (dark theme)
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          ctx.fillStyle = (c + r) % 2 === 0 ? "#1e293b" : "#1a2332";
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
          ctx.strokeStyle = "#334155";
          ctx.lineWidth = 0.3;
          ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
      // Border
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, COLS * TILE, ROWS * TILE);

      if (gs) {
        const isCleared = gs.room_cleared ?? false;

        /* ── PORTAL ───────────────────────────────────────── */
        if (isCleared) {
          const portX = 13 * TILE, portY = 5 * TILE;
          const pS = TILE * 2;
          if (portalImg.current) {
            const floatY = Math.sin(Date.now() / 300) * 8;
            ctx.drawImage(portalImg.current, portX, portY + floatY, pS, pS);
          } else {
            ctx.fillStyle = "#8b5cf6";
            ctx.fillRect(portX, portY, pS, pS);
          }

          const me = gs.players?.find((p: any) => p.id === currentMyId);
          const currentWs = wsRef.current;
          if (me && currentWs?.readyState === WebSocket.OPEN && !changingRoomRef.current) {
            const cx = portX + pS / 2;
            const cy = portY + pS / 2;
            const dist = Math.hypot(me.x + TILE / 2 - cx, me.y + TILE / 2 - cy);
            if (dist < TILE) {
              changingRoomRef.current = true;
              currentWs.send(JSON.stringify({ type: "next_room" }));
              setTimeout(() => { changingRoomRef.current = false; }, 3000);
            }
          }
        }

        /* ── LOOT ─────────────────────────────────────────── */
        for (const l of gs.loot || []) {
          if (l.collected) continue;
          const cx = l.x + TILE / 2, cy = l.y + TILE / 2;
          ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(16, 185, 129, 0.15)"; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = "#10b981"; ctx.stroke();
          ctx.fillStyle = "#e2e8f0";
          ctx.font = "bold 10px 'Segoe UI', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(l.label || "data", cx, l.y + 6);
          ctx.fillStyle = "#10b981";
          ctx.font = "bold 14px monospace";
          ctx.fillText("{}", cx, cy + 6);
        }

        /* ── ENEMIES ──────────────────────────────────────── */
        for (const e of gs.enemies || []) {
          if (!e.alive) continue;
          const blocked = e.depends_on?.length > 0;
          const borderCol = blocked ? "#f59e0b" : "#ef4444";
          const fillCol   = blocked ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)";
          const ex = e.x + 4, ey = e.y + 4, ew = TILE - 8;

          // body
          rrect(ctx, ex, ey, ew, ew, 6);
          ctx.fillStyle = fillCol; ctx.fill();
          ctx.lineWidth = 2.5; ctx.strokeStyle = borderCol; ctx.stroke();

          // face
          ctx.fillStyle = borderCol;
          ctx.fillRect(e.x + 14, e.y + 16, 8, 4);
          ctx.fillRect(e.x + 30, e.y + 16, 8, 4);
          ctx.beginPath();
          ctx.moveTo(e.x + 16, e.y + 30);
          ctx.lineTo(e.x + TILE - 16, e.y + 30);
          ctx.lineWidth = 2; ctx.strokeStyle = borderCol; ctx.stroke();

          // Name label above
          ctx.fillStyle = "#e2e8f0";
          ctx.font = "bold 11px 'Segoe UI', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText((e.label || "?").substring(0, 10), e.x + TILE / 2, e.y - 12);

          // Row data subtext
          const sub = getEnemySubtext(e);
          if (sub) {
            ctx.fillStyle = "#94a3b8";
            ctx.font = "9px 'Segoe UI', sans-serif";
            ctx.fillText(sub.substring(0, 20), e.x + TILE / 2, e.y - 2);
          }

          // HP bar
          const ratio = Math.max(0, e.hp / Math.max(1, e.max_hp));
          const bx = ex + 2, by = ey + ew - 7, bw = ew - 4;
          ctx.fillStyle = "#1e293b";
          rrect(ctx, bx, by, bw, 5, 2); ctx.fill();
          ctx.fillStyle = borderCol;
          rrect(ctx, bx, by, bw * ratio, 5, 2); ctx.fill();

          // Lock badge
          if (blocked) {
            ctx.fillStyle = "#fbbf24";
            ctx.font = "bold 9px sans-serif";
            ctx.fillText("🔒FK", e.x + TILE / 2, e.y + TILE + 10);
          }

          // Target highlight ring
          if (e.id === tid) {
            rrect(ctx, ex - 3, ey - 3, ew + 6, ew + 6, 9);
            ctx.lineWidth = 3; ctx.strokeStyle = "#3b82f6"; ctx.stroke();
            // Pulsing glow
            const pulse = 0.3 + Math.sin(Date.now() / 200) * 0.2;
            ctx.shadowColor = "#3b82f6";
            ctx.shadowBlur = 15 * pulse;
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }

        /* ── PLAYERS ──────────────────────────────────────── */
        for (const p of gs.players || []) {
          const isMe = p.id === currentMyId;
          const px = p.x + 3, py = p.y + 3;
          
          const cClass = getCharClass(p.name || "");
          const atkTime = atkRef.current[p.id] || 0;
          const elapsed = Date.now() - atkTime;
          const isAttacking = elapsed < 500;
          
          const img = isAttacking ? SPRITES_ATK[cClass] : SPRITES[cClass];

          if (img && img.complete && img.naturalWidth) {
            const sh = img.naturalHeight;
            const frames = Math.floor(img.naturalWidth / sh);
            
            let frame = 0;
            if (isAttacking) {
              frame = Math.min(frames - 1, Math.floor((elapsed / 500) * frames));
            } else {
              frame = Math.floor(Date.now() / 100) % frames; 
            }

            const drawW = Math.round(TILE * 1.5);
            const drawH = drawW; 
            const dx = px - (drawW - TILE) / 2;
            const dy = py - (drawH - TILE) / 2 - 12;

            const prevX = prevXRef.current[p.id];
            let facing = facingRef.current[p.id] || 1;
            if (prevX !== undefined) {
              if (p.x > prevX) facing = 1;
              else if (p.x < prevX) facing = -1;
            }
            prevXRef.current[p.id] = p.x;
            facingRef.current[p.id] = facing;

            ctx.save();
            if (facing === -1) {
              ctx.translate(dx + drawW / 2, dy + drawH / 2);
              ctx.scale(-1, 1);
              ctx.translate(-(dx + drawW / 2), -(dy + drawH / 2));
            }

            ctx.drawImage(img, frame * sh, 0, sh, sh, dx, dy, drawW, drawH);
            
            ctx.restore();
          } else {
            const col = isMe ? "#3b82f6" : "#8b5cf6";
            const bg  = isMe ? "rgba(59,130,246,0.2)" : "rgba(139,92,246,0.2)";
            const pw = TILE - 6;

            rrect(ctx, px, py, pw, pw, 8);
            ctx.fillStyle = bg; ctx.fill();
            ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.fillRect(p.x + 12, p.y + 14, 10, 10);
            ctx.fillRect(p.x + 30, p.y + 14, 10, 10);
            ctx.fillStyle = "#000";
            ctx.fillRect(p.x + 16, p.y + 17, 4, 5);
            ctx.fillRect(p.x + 34, p.y + 17, 4, 5);
          }

          // name + score
          ctx.fillStyle = "#e2e8f0";
          ctx.font = "bold 12px 'Segoe UI', sans-serif";
          ctx.textAlign = "center";
          const tag = (p.name || "?").substring(0, 7) + (isMe ? " ★" : "");
          ctx.fillText(tag, p.x + TILE / 2, p.y - 3);

          // HP bar under player
          if (isMe) {
            const hp = p.hp ?? 5, mhp = p.max_hp ?? 5;
            const r = hp / Math.max(1, mhp);
            const bx2 = p.x + 6, by2 = p.y + TILE + 2, bw2 = TILE - 12;
            ctx.fillStyle = "#1e293b";
            rrect(ctx, bx2, by2, bw2, 5, 2); ctx.fill();
            ctx.fillStyle = r > 0.4 ? "#22c55e" : "#ef4444";
            rrect(ctx, bx2, by2, bw2 * r, 5, 2); ctx.fill();
            ctx.fillStyle = "#e2e8f0";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText(`HP ${hp}/${mhp}`, p.x + TILE / 2, p.y + TILE + 16);
          }
        }
      }

      ctx.restore();

      /* ── HUD BAR ────────────────────────────────────────── */
      const hudY = H - 50;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, hudY, W, 50);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, hudY); ctx.lineTo(W, hudY); ctx.stroke();

      let sx = 14;
      for (let i = 0; i < SPELLS.length; i++) {
        const sp = SPELLS[i];
        const active = sp === currentSpell;
        const col = SPELL_COLORS[sp];
        rrect(ctx, sx, hudY + 10, 86, 30, 6);
        ctx.fillStyle = active ? col : "#1e293b";
        ctx.fill();
        ctx.strokeStyle = active ? col : "#475569";
        ctx.lineWidth = active ? 2 : 1;
        ctx.stroke();
        ctx.fillStyle = active ? "#fff" : "#94a3b8";
        ctx.font = "bold 12px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`[${i + 1}] ${sp}`, sx + 43, hudY + 30);
        sx += 92;
      }

      // Target info
      if (tid != null && gs) {
        const tgt = gs.enemies?.find((e: any) => e.id === tid);
        if (tgt) {
          const blocked = tgt.depends_on?.length > 0;
          ctx.fillStyle = "#e2e8f0";
          ctx.font = "bold 12px 'Segoe UI', sans-serif";
          ctx.textAlign = "right";
          const sub = getEnemySubtext(tgt);
          ctx.fillText(
            `TARGET: [${tgt.label}] ${sub ? "(" + sub.substring(0, 15) + ")" : ""}  HP:${tgt.hp}/${tgt.max_hp}  ${blocked ? "🔒FK" : "✓"}`,
            W - 14, hudY + 30
          );
        }
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={920}
      height={720}
      tabIndex={0}
      className="absolute inset-0 w-full h-full outline-none"
      style={{ objectFit: 'contain' }}
    />
  );
}
