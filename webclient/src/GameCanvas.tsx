import { useEffect, useRef, useState } from "react";
import archerIdle from './assets/Archer/Idle.png';
import swordsmanIdle from './assets/Swordsman/Idle.png';
import wizardIdle from './assets/Wizard/Idle.png';
import archerAtk from './assets/Archer/Attack_1.png';
import swordsmanAtk from './assets/Swordsman/Attack_1.png';
import wizardAtk from './assets/Wizard/Attack_1.png';
import portalSprite from './assets/35.png';
import slime1Idle from './assets/mobs/PNG/Slime1/Without_shadow/Slime1_Idle_without_shadow.png';
import slime1Atk  from './assets/mobs/PNG/Slime1/Without_shadow/Slime1_Attack_without_shadow.png';
import slime2Idle from './assets/mobs/PNG/Slime2/Without_shadow/Slime2_Idle_without_shadow.png';
import slime2Atk  from './assets/mobs/PNG/Slime2/Without_shadow/Slime2_Attack_without_shadow.png';
import slime3Idle from './assets/mobs/PNG/Slime3/Without_shadow/Slime3_Idle_without_shadow.png';
import slime3Atk  from './assets/mobs/PNG/Slime3/Without_shadow/Slime3_Attack_without_shadow.png';

import bgTileSrc from './assets/background/1 Tiles/FieldsTile_38.png';
import stone1Src from './assets/background/2 Objects/4 Stone/1.png';
import stone2Src from './assets/background/2 Objects/4 Stone/2.png';
import stone3Src from './assets/background/2 Objects/4 Stone/3.png';
import bush1Src  from './assets/background/2 Objects/9 Bush/1.png';
import bush2Src  from './assets/background/2 Objects/9 Bush/2.png';

const TILE = 56;
const COLS = 20;
const ROWS = 14;

interface Props {
  ws: WebSocket | null;
  gameState: any;
  myId: string | null;
  attacks: Record<string, number>;
  onRequestQuit: () => void;
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
  return bestD < TILE * 1.5 ? best : null;
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

/* ── Slime sprites & Environment ─────────────────────────────────── */
const SLIME_SPRITES: Record<string, HTMLImageElement> = {};
const ENV_SPRITES: Record<string, HTMLImageElement> = {};

if (typeof window !== "undefined") {
  const slimeLoads: [string, string][] = [
    ['slime1Idle', slime1Idle], ['slime1Atk', slime1Atk],
    ['slime2Idle', slime2Idle], ['slime2Atk', slime2Atk],
    ['slime3Idle', slime3Idle], ['slime3Atk', slime3Atk],
  ];
  slimeLoads.forEach(([key, src]) => {
    const img = new Image(); img.src = src;
    SLIME_SPRITES[key] = img;
  });

  const envLoads: [string, string][] = [
    ['bg', bgTileSrc],
    ['stone1', stone1Src], ['stone2', stone2Src], ['stone3', stone3Src],
    ['bush1', bush1Src], ['bush2', bush2Src]
  ];
  envLoads.forEach(([key, src]) => {
    const img = new Image(); img.src = src;
    ENV_SPRITES[key] = img;
  });
}
if (typeof window !== "undefined") {
  const loads: [string, string][] = [
    ['slime1Idle', slime1Idle], ['slime1Atk', slime1Atk],
    ['slime2Idle', slime2Idle], ['slime2Atk', slime2Atk],
    ['slime3Idle', slime3Idle], ['slime3Atk', slime3Atk],
  ];
  loads.forEach(([key, src]) => {
    const img = new Image(); img.src = src;
    SLIME_SPRITES[key] = img;
  });
}

/* Draw one frame from a slime spritesheet (6 cols × 4 rows grid) */
function drawSlimeFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  frameIndex: number,
  dx: number, dy: number, dw: number, dh: number,
) {
  if (!img.complete || !img.naturalWidth) return false;
  const cols = 6;
  const frameW = img.naturalWidth / cols;
  const fi = frameIndex % cols; // Loop only the first row (front animation)
  const col = fi;
  const row = 0;
  ctx.drawImage(img, col * frameW, row * frameW, frameW, frameW, dx, dy, dw, dh);
  return true;
}

function getCharClass(name: string) {
  if (name && name.includes('|')) {
    const parts = name.split('|');
    const cClass = parts[parts.length - 1];
    if (CHAR_CLASSES.includes(cClass)) return cClass;
  }
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

export default function GameCanvas({ ws, gameState, myId, attacks, onRequestQuit }: Props) {
  const portalImg = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = portalSprite;
    img.onload = () => portalImg.current = img;
  }, []);

  const changingRoomRef = useRef(false);
  const isHoveringQuitRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => { wsRef.current = ws; }, [ws]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spell, setSpell] = useState<string>("DELETE");

  const [lockedTarget, setLockedTarget] = useState<number | null>(null);
  const lockedTargetRef = useRef<number | null>(null);
  useEffect(() => { lockedTargetRef.current = lockedTarget; }, [lockedTarget]);

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
        let tid = lockedTargetRef.current;
        if (tid != null) {
          const tgt = gsRef.current?.enemies?.find((en: any) => en.id === tid);
          if (!tgt || !tgt.alive) tid = null;
        }
        if (tid == null) tid = nearestEnemy(gsRef.current, idRef.current);
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
      const gw = COLS * TILE;
      const gh = ROWS * TILE;
      const W = gw;
      const H = gh + 50;

      if (cvs.width !== W) cvs.width = W;
      if (cvs.height !== H) cvs.height = H;

      ctx.imageSmoothingEnabled = false;
      const gs = gsRef.current;
      const currentMyId = idRef.current;
      const currentSpell = spellRef.current;
      
      let tid = lockedTargetRef.current;
      if (tid != null) {
        const tgt = gs?.enemies?.find((en: any) => en.id === tid);
        if (!tgt || !tgt.alive) tid = null;
      }
      if (tid == null) tid = nearestEnemy(gs, currentMyId);

      // Tiled Background
      const roomNum = gs?.room_number || 1;
      const bgImg = ENV_SPRITES['bg'];
      if (bgImg && bgImg.complete && bgImg.naturalWidth) {
        let pat = ctx.createPattern(bgImg, "repeat");
        ctx.fillStyle = pat || "#1b3d1b";
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = "#1b3d1b";
        ctx.fillRect(0, 0, W, H);
      }

      ctx.save();

      // Fallback floor tiles if image not loaded
      if (!bgImg || !bgImg.complete || !bgImg.naturalWidth) {
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            ctx.fillStyle = (c + r) % 2 === 0 ? "#1e293b" : "#1a2332";
            ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
          }
        }
      }

      // Procedural Decorations
      const seededRandom = (seed: number) => {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };

      const decos = ['stone1', 'stone2', 'stone3', 'bush1', 'bush2'];
      let seed = roomNum * 1337;
      
      // Draw ~15-20 decorations per room based on room number
      const numDecos = 10 + Math.floor(seededRandom(seed++) * 10);
      for (let i = 0; i < numDecos; i++) {
        const decoType = decos[Math.floor(seededRandom(seed++) * decos.length)];
        const img = ENV_SPRITES[decoType];
        
        // Random position, biased towards edges so they don't block center paths too much
        const dx = seededRandom(seed++) * (COLS * TILE);
        const dy = seededRandom(seed++) * (ROWS * TILE);
        // Vary the scale slightly
        const scale = 0.8 + seededRandom(seed++) * 0.4;
        
        if (img && img.complete && img.naturalWidth) {
          const w = TILE * scale;
          const h = (img.naturalHeight / img.naturalWidth) * w;
          ctx.drawImage(img, dx - w/2, dy - h/2, w, h);
        }
      }

      // Border
      ctx.strokeStyle = "#3e240f";
      ctx.lineWidth = 6;
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

          // Pick sprite based on civilian vs target
          const atkTime = atkRef.current["enemy_" + e.id] || 0;
          const elapsed = Date.now() - atkTime;
          const isBeingHit = elapsed < 400;
          
          // Randomize visual based on ID consistently so it doesn't reveal who is a target
          // (e.id % 3) will be 0, 1, or 2. Add 1 to get Slime 1, 2, or 3.
          const slimeType = (e.id % 3) + 1; 

          const idleImg = SLIME_SPRITES[`slime${slimeType}Idle`];
          const atkImg  = SLIME_SPRITES[`slime${slimeType}Atk`];
          const spriteImg = isBeingHit && atkImg ? atkImg : idleImg;

          const spriteSize = TILE * 1.25;
          const sdx = e.x + (TILE - spriteSize) / 2;
          const sdy = e.y + (TILE - spriteSize) / 2 - 8;
          const frameIdx = Math.floor(Date.now() / 120);

          const drawn = spriteImg ? drawSlimeFrame(ctx, spriteImg, frameIdx, sdx, sdy, spriteSize, spriteSize) : false;

          // Fallback: draw colored box if sprite not ready
          if (!drawn) {
            const borderCol = "#ef4444";
            const fillCol   = "rgba(239,68,68,0.15)";
            const ex2 = e.x + 4, ey2 = e.y + 4, ew2 = TILE - 8;
            rrect(ctx, ex2, ey2, ew2, ew2, 6);
            ctx.fillStyle = fillCol; ctx.fill();
            ctx.lineWidth = 2.5; ctx.strokeStyle = borderCol; ctx.stroke();
          }

          // Name label above
          ctx.fillStyle = "#e2e8f0";
          ctx.font = "bold 11px 'Segoe UI', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText((e.label || "?").substring(0, 10), e.x + TILE / 2, e.y - 12);

          // HP bar
          const ex = e.x + 4, ey = e.y + 4, ew = TILE - 8;
          const ratio = Math.max(0, e.hp / Math.max(1, e.max_hp));
          const bx = ex + 2, by = ey + ew - 7, bw = ew - 4;
          const hpCol = "#ef4444"; // Same color for everyone to hide identity
          ctx.fillStyle = "#1e293b";
          rrect(ctx, bx, by, bw, 5, 2); ctx.fill();
          ctx.fillStyle = hpCol;
          rrect(ctx, bx, by, bw * ratio, 5, 2); ctx.fill();

          // Lock badge
          if (blocked) {
            ctx.fillStyle = "#fbbf24";
            ctx.font = "bold 9px sans-serif";
            ctx.fillText("🔒FK", e.x + TILE / 2, e.y + TILE + 10);
          }

          // Target highlight ring
          if (e.id === tid) {
            const hx = e.x + 10;
            const hy = e.y + 4;
            const hw = TILE - 20;
            const hh = TILE - 20;
            rrect(ctx, hx, hy, hw, hh, 8);
            ctx.lineWidth = 3; ctx.strokeStyle = "#3b82f6"; ctx.stroke();
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
          const rawName = p.name || "?";
          const displayName = rawName.includes('|') ? rawName.split('|')[0] : rawName;
          const tag = displayName.substring(0, 7) + (isMe ? " ★" : "");
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

            const spCol = SPELL_COLORS[currentSpell] || "#3b82f6";
            ctx.fillStyle = spCol;
            rrect(ctx, p.x + TILE / 2 - 25, p.y - 35, 50, 16, 4);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 10px 'Segoe UI', sans-serif";
            ctx.fillText(currentSpell, p.x + TILE / 2, p.y - 24);
          }
        }
      }

      /* ── HUD BAR ────────────────────────────────────────── */
      const hudY = ROWS * TILE;
      ctx.fillStyle = "#3e240f"; // wooden hud background
      ctx.fillRect(0, hudY, W, 50);
      ctx.strokeStyle = "#1e1208"; // dark wood border
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, hudY); ctx.lineTo(W, hudY); ctx.stroke();

      let sx = 14;
      for (let i = 0; i < SPELLS.length; i++) {
        const sp = SPELLS[i];
        const active = sp === currentSpell;
        const col = SPELL_COLORS[sp];
        rrect(ctx, sx, hudY + 10, 86, 30, 6);
        ctx.fillStyle = active ? col : "#523315"; // wooden inactive btn
        ctx.fill();
        ctx.strokeStyle = active ? col : "#2e1d0d"; // wooden edge
        ctx.lineWidth = active ? 3 : 2;
        ctx.stroke();
        ctx.fillStyle = active ? "#fff" : "#d4b483"; // cream inactive text
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
          ctx.fillStyle = "#fde6b3"; // light yellow/cream font
          ctx.font = "bold 12px 'Segoe UI', sans-serif";
          ctx.textAlign = "right";
          const sub = getEnemySubtext(tgt);
          ctx.fillText(
            `TARGET: [${tgt.label}] ${sub ? "(" + sub.substring(0, 15) + ")" : ""}  HP:${tgt.hp}/${tgt.max_hp}  ${blocked ? "🔒FK" : "✓"}`,
            gw - 14 - 86 - 20, hudY + 30
          );
        }
      }

      // Quit Button
      const quitW = 86;
      const quitX = gw - 14 - quitW;
      const quitY = hudY + 10;
      const hoveringQuit = isHoveringQuitRef.current;
      rrect(ctx, quitX, quitY, quitW, 30, 6);
      ctx.fillStyle = hoveringQuit ? "#784b1f" : "#523315"; // lighter if hovered
      ctx.fill();
      ctx.strokeStyle = hoveringQuit ? "#4a2e15" : "#2e1d0d"; 
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = hoveringQuit ? "#f87171" : "#ef4444"; // brighter red if hovered
      ctx.font = "bold 12px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("QUIT", quitX + quitW / 2, hudY + 30);

      ctx.restore();

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const gw = COLS * TILE;
    const hudY = ROWS * TILE;
    const quitW = 86;
    const quitX = gw - 14 - quitW;
    const quitY = hudY + 10;
    
    if (x >= quitX && x <= quitX + quitW && y >= quitY && y <= quitY + 30) {
      isHoveringQuitRef.current = true;
      cvs.style.cursor = "pointer";
    } else {
      isHoveringQuitRef.current = false;
      cvs.style.cursor = "default";
    }
  };

  const handleMouseLeave = () => {
    isHoveringQuitRef.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = "default";
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check Quit button
    const gw = COLS * TILE;
    const hudY = ROWS * TILE;
    const quitW = 86;
    const quitX = gw - 14 - quitW;
    const quitY = hudY + 10;
    if (x >= quitX && x <= quitX + quitW && y >= quitY && y <= quitY + 30) {
      onRequestQuit();
      return;
    }

    const gs = gsRef.current;
    if (!gs) return;
    for (const enemy of gs.enemies || []) {
      if (!enemy.alive) continue;
      if (x >= enemy.x && x <= enemy.x + TILE && y >= enemy.y && y <= enemy.y + TILE) {
        setLockedTarget(enemy.id);
        return;
      }
    }
    setLockedTarget(null);
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      width={896}
      height={722}
      tabIndex={0}
      className="block w-full h-full outline-none"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
