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
import bossWalk1 from './assets/sprite-boss/sprite-gengar-walk-1.png';
import bossWalk2 from './assets/sprite-boss/sprite-gengar-walk-2.png';
import bossWalk3 from './assets/sprite-boss/sprite-gengar-walk-3.png';
import bossWalk4 from './assets/sprite-boss/sprite-gengar-walk-4.png';
import bossWalk5 from './assets/sprite-boss/sprite-gengar-walk-5.png';

import bgTileSrc from './assets/background/1 Tiles/FieldsTile_38.png';
import roadTileSrc from './assets/background/1 Tiles/FieldsTile_41.png';
import stone1Src from './assets/background/2 Objects/4 Stone/1.png';
import stone2Src from './assets/background/2 Objects/4 Stone/2.png';
import stone3Src from './assets/background/2 Objects/4 Stone/3.png';
import bush1Src  from './assets/background/2 Objects/9 Bush/1.png';
import bush2Src  from './assets/background/2 Objects/9 Bush/2.png';
import camp1Src from './assets/background/2 Objects/8 Camp/1.png';
import camp2Src from './assets/background/2 Objects/8 Camp/2.png';
import tree1Src from './assets/background/2 Objects/7 Decor/Tree1.png';
import tree2Src from './assets/background/2 Objects/7 Decor/Tree2.png';
import log1Src from './assets/background/2 Objects/7 Decor/Log1.png';
import lamp1Src from './assets/background/2 Objects/7 Decor/Lamp1.png';
import box1Src from './assets/background/2 Objects/7 Decor/Box1.png';
import grass1Src from './assets/background/2 Objects/5 Grass/1.png';
import grass2Src from './assets/background/2 Objects/5 Grass/2.png';
import flower1Src from './assets/background/2 Objects/6 Flower/1.png';
import flower2Src from './assets/background/2 Objects/6 Flower/2.png';
import fence1Src from './assets/background/2 Objects/2 Fence/1.png';
import fence2Src from './assets/background/2 Objects/2 Fence/2.png';
import pointer1Src from './assets/background/2 Objects/3 Pointer/1.png';
import pointer2Src from './assets/background/2 Objects/3 Pointer/2.png';

export function PixelHeart({ filled = true }: { filled?: boolean }) {
  const pixelSize = 2;
  const heartData = [
    [0,2,2,2,0,2,2,2,0],
    [2,1,1,1,2,1,1,1,2],
    [2,1,1,1,1,1,1,1,2],
    [2,1,1,1,1,1,1,1,2],
    [0,2,1,1,1,1,1,2,0],
    [0,0,2,1,1,1,2,0,0],
    [0,0,0,2,1,2,0,0,0],
    [0,0,0,0,2,0,0,0,0]
  ];
  const w = heartData[0].length * pixelSize;
  const h = heartData.length * pixelSize;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block shrink-0" style={{marginTop: '-2px'}}>
      {heartData.map((row, r) => 
        row.map((val, c) => {
          if (val === 0) return null;
          let color = val === 2 ? "#111827" : "#ef4444";
          if (!filled && val === 1) color = "#1e1208";
          return <rect key={`${r}-${c}`} x={c * pixelSize} y={r * pixelSize} width={pixelSize} height={pixelSize} fill={color} />;
        })
      )}
    </svg>
  );
}

const TILE = 56;
const COLS = 20;
const ROWS = 14;

interface Props {
  ws: WebSocket | null;
  gameState: any;
  myId: string | null;
  attacks: Record<string, number>;
  castSpells: Record<string, string>;
  onRequestQuit: () => void;
  inputLocked?: boolean;
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
type SpellName = typeof SPELLS[number];
const ROLE_SPELLS: Record<string, Set<SpellName>> = {
  Archer: new Set(["DELETE"]),
  Swordsman: new Set(["INSERT", "UPDATE"]),
  Wizard: new Set(["SELECT", "JOIN"]),
};
const DEFAULT_SPELL_BY_CLASS: Record<string, SpellName> = {
  Archer: "DELETE",
  Swordsman: "INSERT",
  Wizard: "SELECT",
};

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
let BOSS_SPRITES: HTMLImageElement[] = [];

if (typeof window !== "undefined") {
  const bossSrcs = [bossWalk1, bossWalk2, bossWalk3, bossWalk4, bossWalk5];
  bossSrcs.forEach(src => {
    const img = new Image();
    img.src = src;
    BOSS_SPRITES.push(img);
  });
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
    ['road', roadTileSrc],
    ['stone1', stone1Src], ['stone2', stone2Src], ['stone3', stone3Src],
    ['bush1', bush1Src], ['bush2', bush2Src],
    ['camp1', camp1Src], ['camp2', camp2Src],
    ['tree1', tree1Src], ['tree2', tree2Src],
    ['log1', log1Src], ['lamp1', lamp1Src], ['box1', box1Src],
    ['grass1', grass1Src], ['grass2', grass2Src],
    ['flower1', flower1Src], ['flower2', flower2Src],
    ['fence1', fence1Src], ['fence2', fence2Src],
    ['pointer1', pointer1Src], ['pointer2', pointer2Src]
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

function getAllowedSpellsForPlayer(player: any): Set<SpellName> {
  const set = new Set<SpellName>();
  const roles = Array.isArray(player?.roles) ? player.roles : [];
  for (const role of roles) {
    const roleSet = ROLE_SPELLS[role];
    if (!roleSet) continue;
    for (const sp of roleSet) set.add(sp);
  }
  const granted = Array.isArray(player?.granted_spells) ? player.granted_spells : [];
  for (const sp of granted) {
    if ((SPELLS as readonly string[]).includes(sp)) set.add(sp as SpellName);
  }
  const baseClass = player?.name?.split('|')?.[1] || '';
  if (set.size === 0) {
    const fallback = ROLE_SPELLS[baseClass] ?? new Set<SpellName>(["DELETE"]);
    for (const sp of fallback) set.add(sp);
  }
  if (player?.can_query) {
    set.add("SELECT");
    set.add("JOIN");
  }
  return set;
}

export default function GameCanvas({ ws, gameState, myId, attacks, castSpells, onRequestQuit, inputLocked = false }: Props) {
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
  const [spell, setSpell] = useState<SpellName>("DELETE");

  const [lockedTarget, setLockedTarget] = useState<number | null>(null);
  const lockedTargetRef = useRef<number | null>(null);
  useEffect(() => { lockedTargetRef.current = lockedTarget; }, [lockedTarget]);

  const spellRef = useRef<SpellName>(spell);
  useEffect(() => { spellRef.current = spell; }, [spell]);

  const gsRef = useRef<any>(null);
  useEffect(() => { gsRef.current = gameState; }, [gameState]);

  const idRef = useRef<string | null>(null);
  useEffect(() => { idRef.current = myId; }, [myId]);

  const myPlayer = gameState?.players?.find((p: any) => p.id === myId);
  // Derive own player class from game state
  const myClass = myPlayer?.name?.split('|')?.[1] || '';
  const grantedSpells = (Array.isArray(myPlayer?.granted_spells) ? myPlayer.granted_spells : [])
    .filter((s: string) => (SPELLS as readonly string[]).includes(s)) as SpellName[];
  const allowedSpells = getAllowedSpellsForPlayer(myPlayer);

  // Filter SPELLS list to only show role-permitted spells in the HUD
  const visibleSpells = SPELLS.filter(s => allowedSpells.has(s));
  const fallbackSpell = visibleSpells[0] ?? (DEFAULT_SPELL_BY_CLASS[myClass] ?? "DELETE");

  // Refs so the keyboard useEffect closure (runs once) always reads fresh values
  const visibleSpellsRef = useRef(visibleSpells);
  useEffect(() => { visibleSpellsRef.current = visibleSpells; }, [visibleSpells]);

  // Auto-correct active spell if current selection is not allowed for this role
  useEffect(() => {
    if (!allowedSpells.has(spell)) {
      setSpell(fallbackSpell);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myClass, fallbackSpell, grantedSpells.length]);

  const atkRef = useRef<Record<string, number>>({});
  useEffect(() => { atkRef.current = attacks; }, [attacks]);
  const castSpellsRef = useRef<Record<string, string>>({});
  useEffect(() => { castSpellsRef.current = castSpells; }, [castSpells]);

  const prevXRef = useRef<Record<string, number>>({});
  const facingRef = useRef<Record<string, number>>({});

  const keys = useRef<Record<string, boolean>>({});
  const inputLockedRef = useRef(inputLocked);
  useEffect(() => {
    inputLockedRef.current = inputLocked;
    if (inputLocked) keys.current = {};
  }, [inputLocked]);

  /* ── keyboard ─────────────────────────────────────────────── */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (inputLockedRef.current) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      keys.current[e.key.toLowerCase()] = true;

      if (e.key >= "1" && e.key <= "5") {
        // Map key to role-visible spells only
        const idx = +e.key - 1;
        const targetSpell = visibleSpellsRef.current[idx];
        if (targetSpell) setSpell(targetSpell);
      }

      if (e.key.toLowerCase() === "e" && wsRef.current?.readyState === WebSocket.OPEN) {
        let tid = lockedTargetRef.current;
        if (tid != null) {
          const tgt = gsRef.current?.enemies?.find((en: any) => en.id === tid);
          if (!tgt || !tgt.alive) tid = null;
        }
        if (tid == null) tid = nearestEnemy(gsRef.current, idRef.current);
        const currentPlayer = gsRef.current?.players?.find((p: any) => p.id === idRef.current);
        const currentClass = currentPlayer?.name?.split('|')?.[1] || '';
        const roleSpells = getAllowedSpellsForPlayer(currentPlayer);
        const classFallback = SPELLS.find((s) => roleSpells.has(s)) ?? (DEFAULT_SPELL_BY_CLASS[currentClass] ?? "DELETE");
        const spellToCast = roleSpells.has(spellRef.current as SpellName)
          ? spellRef.current
          : classFallback;
        if (idRef.current) {
          atkRef.current[idRef.current] = Date.now();
          castSpellsRef.current[idRef.current] = spellToCast;
        }
        wsRef.current.send(JSON.stringify({ type: "spell", spell: spellToCast, target_id: tid }));
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
      if (inputLockedRef.current) return;
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
      const currentMe = gs?.players?.find((p: any) => p.id === currentMyId);
      const currentAllowedSpells = getAllowedSpellsForPlayer(currentMe);
      const currentVisibleSpells = SPELLS.filter(s => currentAllowedSpells.has(s));
      const revealedEnemyIds = new Set<number>(
        Array.isArray(gs?.revealed_enemy_ids) ? gs.revealed_enemy_ids : []
      );
      
      let tid = lockedTargetRef.current;
      if (tid != null) {
        const tgt = gs?.enemies?.find((en: any) => en.id === tid);
        if (!tgt || !tgt.alive) tid = null;
      }
      if (tid == null) tid = nearestEnemy(gs, currentMyId);

      // Tiled Background with Random Rotations
      const roomNum = gs?.room_number || 1;
      
      const seededRandomForTile = (seed: number) => {
        let x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      };

      const bgImg = ENV_SPRITES['bg'];
      const roadImg = ENV_SPRITES['road'];

      ctx.fillStyle = "#1b3d1b";
      ctx.fillRect(0, 0, W, H);

      // Procedural Pokémon-style Route Generation
      const roadTiles = new Set<string>();
      let routeSeed = roomNum * 123;
      
      // Random walk for horizontal path
      let currentR = Math.floor(ROWS / 2);
      for (let c = 0; c < COLS; c++) {
         roadTiles.add(`${c},${currentR}`);
         roadTiles.add(`${c},${currentR + 1}`);
         
         // Randomly move up or down to create a zigzag
         const step = seededRandomForTile(routeSeed++);
         if (step > 0.6 && currentR < ROWS - 3) {
             currentR++;
             roadTiles.add(`${c},${currentR}`);
             roadTiles.add(`${c},${currentR + 1}`);
         } else if (step < 0.4 && currentR > 2) {
             currentR--;
             roadTiles.add(`${c},${currentR}`);
             roadTiles.add(`${c},${currentR + 1}`);
         }
      }

      // Random walk for vertical path
      let currentC = Math.floor(COLS / 2);
      for (let r = 0; r < ROWS; r++) {
         roadTiles.add(`${currentC},${r}`);
         roadTiles.add(`${currentC + 1},${r}`);
         
         // Randomly move left or right
         const step = seededRandomForTile(routeSeed++);
         if (step > 0.6 && currentC < COLS - 3) {
             currentC++;
             roadTiles.add(`${currentC},${r}`);
             roadTiles.add(`${currentC + 1},${r}`);
         } else if (step < 0.4 && currentC > 2) {
             currentC--;
             roadTiles.add(`${currentC},${r}`);
             roadTiles.add(`${currentC + 1},${r}`);
         }
      }

      // Scatter some random natural patches to make it look less linear
      const numPatches = 15 + Math.floor(seededRandomForTile(routeSeed++) * 20);
      for (let i = 0; i < numPatches; i++) {
         const randC = Math.floor(seededRandomForTile(routeSeed++) * COLS);
         const randR = Math.floor(seededRandomForTile(routeSeed++) * ROWS);
         roadTiles.add(`${randC},${randR}`);
         // Add adjacent tiles for clustering
         if (seededRandomForTile(routeSeed++) > 0.5) roadTiles.add(`${randC + 1},${randR}`);
         if (seededRandomForTile(routeSeed++) > 0.5) roadTiles.add(`${randC},${randR + 1}`);
      }

      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const isRoadTile = roadTiles.has(`${c},${r}`);
          const isRoad = roadImg && roadImg.complete && roadImg.naturalWidth && isRoadTile;
          const isBg = bgImg && bgImg.complete && bgImg.naturalWidth;
          
          let tileToDraw = isRoad ? roadImg : (isBg ? bgImg : null);
          
          if (tileToDraw) {
            const rotSeed = roomNum * 1000 + c * 100 + r;
            const rotations = Math.floor(seededRandomForTile(rotSeed) * 4);
            
            ctx.save();
            ctx.translate(c * TILE + TILE / 2, r * TILE + TILE / 2);
            ctx.rotate(rotations * Math.PI / 2);
            ctx.drawImage(tileToDraw, -TILE / 2, -TILE / 2, TILE, TILE);
            ctx.restore();
          } else if (!isRoad && !isBg) {
            ctx.fillStyle = (c + r) % 2 === 0 ? "#1e293b" : "#1a2332";
            ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
          }
        }
      }

      ctx.save();

      // Procedural Decorations
      const seededRandom = (seed: number) => {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };

      const decos = [
        'stone1', 'stone2', 'stone3', 'bush1', 'bush2',
        'camp1', 'camp2', 'tree1', 'tree2', 'log1', 'lamp1', 'box1',
        'grass1', 'grass2', 'flower1', 'flower2', 'fence1', 'fence2',
        'pointer1', 'pointer2'
      ];
      let seed = roomNum * 1337;
      
      // Draw ~15-20 decorations per room based on room number
      const numDecos = 10 + Math.floor(seededRandom(seed++) * 10);
      const placedDecos: {x: number, y: number, w: number, h: number}[] = [];
      
      for (let i = 0; i < numDecos * 5; i++) {
        if (placedDecos.length >= numDecos) break;
        
        const decoType = decos[Math.floor(seededRandom(seed++) * decos.length)];
        const img = ENV_SPRITES[decoType];
        
        // Random position, biased towards edges so they don't block center paths too much
        const dx = seededRandom(seed++) * (COLS * TILE);
        const dy = seededRandom(seed++) * (ROWS * TILE);
        // Vary the scale slightly
        let scale = 0.8 + seededRandom(seed++) * 0.4;
        if (decoType.startsWith('flower') || decoType.startsWith('grass')) {
            scale *= 0.35; // make flowers and grass much smaller
        }
        
        if (img && img.complete && img.naturalWidth) {
          const w = TILE * scale;
          const h = (img.naturalHeight / img.naturalWidth) * w;
          
          const padding = 8;
          const left = dx - w/2 - padding;
          const right = dx + w/2 + padding;
          const top = dy - h/2 - padding;
          const bottom = dy + h/2 + padding;

          let overlap = false;
          for (const p of placedDecos) {
             if (left < p.x + p.w && right > p.x && top < p.y + p.h && bottom > p.y) {
                 overlap = true;
                 break;
             }
          }

          if (!overlap) {
              placedDecos.push({x: left, y: top, w: right - left, h: bottom - top});
              ctx.drawImage(img, dx - w/2, dy - h/2, w, h);
          }
        }
      }

      // Border
      ctx.strokeStyle = "#3e240f";
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, COLS * TILE, ROWS * TILE);

      if (gs) {
        const isJoined = gs.room_joined ?? false;

        /* ── PORTAL ───────────────────────────────────────── */
        if (isJoined) {
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
              currentWs.send(JSON.stringify({ type: "trigger_level_complete" }));
              setTimeout(() => { changingRoomRef.current = false; }, 3000);
            }
          }
        }

        /* ── LOOT ─────────────────────────────────────────── */
        for (const l of gs.loot || []) {
          if (l.collected) continue;
          const cx = l.x + TILE / 2, cy = l.y + TILE / 2;
          
          if (l.label === "health") {
            const pulseY = Math.sin(Date.now() / 200) * 4;
            const pulseScale = 1 + Math.sin(Date.now() / 150) * 0.15;
            ctx.save();
            ctx.translate(cx, cy + pulseY);
            ctx.scale(pulseScale, pulseScale);
            
            const pixelSize = 3;
            const heartData = [
              [0,2,2,2,0,2,2,2,0],
              [2,1,1,1,2,1,1,1,2],
              [2,1,1,1,1,1,1,1,2],
              [2,1,1,1,1,1,1,1,2],
              [0,2,1,1,1,1,1,2,0],
              [0,0,2,1,1,1,2,0,0],
              [0,0,0,2,1,2,0,0,0],
              [0,0,0,0,2,0,0,0,0]
            ];
            
            const hW = heartData[0].length * pixelSize;
            const hH = heartData.length * pixelSize;
            for (let r = 0; r < heartData.length; r++) {
              for (let c = 0; c < heartData[r].length; c++) {
                const val = heartData[r][c];
                if (val === 1) {
                  ctx.fillStyle = "#ef4444"; // red
                  ctx.fillRect(c * pixelSize - hW/2, r * pixelSize - hH/2, pixelSize, pixelSize);
                } else if (val === 2) {
                  ctx.fillStyle = "#111827"; // black/dark outline
                  ctx.fillRect(c * pixelSize - hW/2, r * pixelSize - hH/2, pixelSize, pixelSize);
                }
              }
            }
            
            ctx.restore();
          } else {
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

          const isBoss = gs.room_number === 5;
          const spriteSize = isBoss ? TILE * 4 : TILE * 2.25;
          const sdx = e.x + (TILE - spriteSize) / 2;
          const sdy = e.y + (TILE - spriteSize) / 2 - (isBoss ? 40 : 16);
          const frameIdx = Math.floor(Date.now() / 120);

          let drawn = false;
          if (isBoss && BOSS_SPRITES.length > 0) {
              const currentBossImg = BOSS_SPRITES[frameIdx % BOSS_SPRITES.length];
              if (currentBossImg && currentBossImg.complete) {
                  // Pulse the boss if being hit
                  ctx.save();
                  if (isBeingHit) {
                     ctx.filter = "brightness(2) sepia(1) hue-rotate(-50deg) saturate(5)";
                  }
                  // Make the boss bounce slightly
                  const bounceY = Math.sin(Date.now() / 150) * 10;
                  ctx.drawImage(currentBossImg, sdx, sdy + bounceY, spriteSize, spriteSize);
                  ctx.restore();
                  drawn = true;
              }
          } else {
              drawn = spriteImg ? drawSlimeFrame(ctx, spriteImg, frameIdx, sdx, sdy, spriteSize, spriteSize) : false;
          }

          // Fallback: draw colored box if sprite not ready
          if (!drawn) {
            const borderCol = "#ef4444";
            const fillCol   = "rgba(239,68,68,0.15)";
            const ex2 = e.x + 4, ey2 = e.y + 4, ew2 = TILE - 8;
            rrect(ctx, ex2, ey2, ew2, ew2, 6);
            ctx.fillStyle = fillCol; ctx.fill();
            ctx.lineWidth = 2.5; ctx.strokeStyle = borderCol; ctx.stroke();
          }

          const buffTime = atkRef.current["buff_" + e.id] || 0;
          const timeSinceBuff = Date.now() - buffTime;
          const isBuffed = e.buffed;
          
          if (isBuffed) {
             // Draw golden aura
             ctx.beginPath();
             ctx.arc(e.x + TILE/2, e.y + TILE/2 - 8, TILE * 0.8, 0, Math.PI*2);
             ctx.fillStyle = "rgba(250, 204, 21, 0.25)"; // gold
             ctx.fill();
          }

          if (timeSinceBuff > 0 && timeSinceBuff < 2000) {
             // Level Up Animation
             const animProgress = timeSinceBuff / 2000;
             const ringRadius = TILE * 1.5 * animProgress;
             ctx.beginPath();
             ctx.arc(e.x + TILE/2, e.y + TILE/2 - 8, ringRadius, 0, Math.PI*2);
             ctx.strokeStyle = `rgba(250, 204, 21, ${1 - animProgress})`;
             ctx.lineWidth = 4;
             ctx.stroke();

             const textYOffset = animProgress * 40;
             ctx.fillStyle = `rgba(250, 204, 21, ${1 - animProgress})`;
             ctx.font = "bold 16px 'Pixelify Sans', 'Segoe UI', sans-serif";
             ctx.textAlign = "center";
             ctx.fillText("BUFFED!", e.x + TILE / 2, e.y - 20 - textYOffset);
          }

          // Name label above (hidden until revealed by successful SELECT inspect)
          if (revealedEnemyIds.has(e.id)) {
            ctx.fillStyle = "#e2e8f0";
            ctx.font = "bold 11px 'Segoe UI', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText((e.label || "?").substring(0, 10), e.x + TILE / 2, e.y - 12);
          }

          // HP bar
          const ex = e.x + 4, ey = e.y + 4, ew = TILE - 8;
          const ratio = Math.max(0, e.hp / Math.max(1, e.max_hp));
          const bx = ex + 2, by = ey + ew - 7, bw = ew - 4;
          const hpCol = isBuffed ? "#facc15" : "#ef4444"; // Gold if buffed
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

          // Bouncing pixel art red arrow above targeted enemy
          if (e.id === tid) {
            const bounce = Math.sin(Date.now() / 250) * 5;
            const ps = 4; // pixel size
            // Pixel grid for downward arrow (1=red, 2=dark outline, 0=empty)
            const arrowPixels = [
              [0,0,2,2,2,2,2,0,0],
              [0,0,2,1,1,1,2,0,0],
              [0,0,2,1,1,1,2,0,0],
              [0,0,2,1,1,1,2,0,0],
              [2,2,2,1,1,1,2,2,2],
              [0,2,1,1,1,1,1,2,0],
              [0,0,2,1,1,1,2,0,0],
              [0,0,0,2,1,2,0,0,0],
              [0,0,0,0,2,0,0,0,0],
            ];
            const gw = arrowPixels[0].length * ps;
            const gh = arrowPixels.length * ps;
            const startX = Math.floor(e.x + TILE / 2 - gw / 2);
            const startY = Math.floor(e.y - gh - 4 + bounce);
            for (let r = 0; r < arrowPixels.length; r++) {
              for (let c = 0; c < arrowPixels[r].length; c++) {
                const val = arrowPixels[r][c];
                if (val === 0) continue;
                ctx.fillStyle = val === 1 ? "#ef4444" : "#1a0000";
                ctx.fillRect(startX + c * ps, startY + r * ps, ps, ps);
              }
            }
          }
        }

        /* ── PLAYERS ──────────────────────────────────────── */
        for (const p of gs.players || []) {
          const isMe = p.id === currentMyId;
          const isDead = p.hp !== undefined && p.hp <= 0;
          const px = p.x + 3, py = p.y + 3;
          
          const cClass = getCharClass(p.name || "");
          const atkTime = atkRef.current[p.id] || 0;
          const elapsed = Date.now() - atkTime;
          const isAttacking = elapsed < 500;
          const castSpell = castSpellsRef.current[p.id];
          const isBossRoom = (gs?.room_number || 1) === 5;
          const isSwordsmanUpdateCast = !isBossRoom && cClass === "Swordsman" && castSpell === "UPDATE" && isAttacking;
          
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

            const drawW = Math.round(TILE * 2.5);
            const drawH = drawW; 
            const dx = px - (drawW - TILE) / 2;
            const dy = py - (drawH - TILE) / 2 - 18;

            const prevX = prevXRef.current[p.id];
            let facing = facingRef.current[p.id] || 1;
            if (prevX !== undefined) {
              if (p.x > prevX) facing = 1;
              else if (p.x < prevX) facing = -1;
            }
            prevXRef.current[p.id] = p.x;
            facingRef.current[p.id] = facing;

            ctx.save();
            if (isDead) {
              ctx.globalAlpha = 0.4;
            }
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

          if (isSwordsmanUpdateCast) {
            const pulse = 0.65 + Math.sin(Date.now() / 85) * 0.35;
            const radius = TILE * (0.68 + pulse * 0.4);
            const cx = p.x + TILE / 2;
            const cy = p.y + TILE / 2 - 10;
            ctx.save();
            ctx.globalAlpha = 0.5 + pulse * 0.25;
            ctx.strokeStyle = "#f59e0b";
            ctx.lineWidth = 3;
            ctx.shadowColor = "#facc15";
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 0.22 + pulse * 0.18;
            ctx.fillStyle = "#f59e0b";
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // name + score
          ctx.fillStyle = isDead ? "#ef4444" : "#e2e8f0";
          ctx.font = "bold 12px 'Segoe UI', sans-serif";
          ctx.textAlign = "center";
          const rawName = p.name || "?";
          const displayName = rawName.includes('|') ? rawName.split('|')[0] : rawName;
          const tag = displayName.substring(0, 7) + (isMe ? " ★" : "") + (isDead ? " 💀" : "");
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
      for (let i = 0; i < currentVisibleSpells.length; i++) {
        const sp = currentVisibleSpells[i];
        const active = sp === currentSpell;
        const col = SPELL_COLORS[sp];
        const label = `[${i + 1}] ${sp}`;
        const btnW = 86;
        rrect(ctx, sx, hudY + 10, btnW, 30, 6);
        ctx.fillStyle = active ? col : "#523315";
        ctx.fill();
        ctx.strokeStyle = active ? col : "#2e1d0d";
        ctx.lineWidth = active ? 3 : 2;
        ctx.stroke();
        ctx.fillStyle = active ? "#fff" : "#d4b483";
        ctx.font = "bold 11px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, sx + btnW / 2, hudY + 30);
        sx += btnW + 6;
      }

      // Target info
      if (tid != null && gs) {
        const tgt = gs.enemies?.find((e: any) => e.id === tid);
        if (tgt) {
          const blocked = tgt.depends_on?.length > 0;
          const targetLabel = revealedEnemyIds.has(tgt.id) ? (tgt.label || "?") : "UNKNOWN";
          ctx.fillStyle = "#fde6b3"; // light yellow/cream font
          ctx.font = "bold 12px 'Segoe UI', sans-serif";
          ctx.textAlign = "right";
          const sub = getEnemySubtext(tgt);
          ctx.fillText(
            `TARGET: [${targetLabel}] ${sub ? "(" + sub.substring(0, 15) + ")" : ""}  HP:${tgt.hp}/${tgt.max_hp}  ${blocked ? "🔒FK" : "✓"}`,
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
    <div className="w-full h-full relative">
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
      <div className="absolute top-4 left-0 w-full flex flex-wrap justify-center gap-4 pointer-events-none px-4">
        {(gameState?.players || []).map((p: any) => {
          const isDead = p.lives !== undefined && p.lives <= 0;
          const livesCount = p.lives ?? 3;
          return (
            <div key={p.id} className="bg-[#2e1d0d]/80 border-2 border-[#523315] rounded-lg p-2 flex items-center gap-3 backdrop-blur-sm">
              <span className={`font-bold text-sm tracking-wider w-20 truncate ${isDead ? 'text-[#ef4444]' : 'text-[#fde6b3]'}`}>
                {p.name?.split('|')[0] || "?"}
              </span>
              <div className="flex gap-1">
                {isDead ? (
                  <span className="text-xl">💀</span>
                ) : (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={`flex items-center justify-center ${i < livesCount ? "animate-pulse" : "opacity-60"}`}>
                      <PixelHeart filled={i < livesCount} />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
