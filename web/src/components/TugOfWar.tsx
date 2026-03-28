"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { GMONAD_COMMUNITIES, type CommunityId } from "@/utils/gmonadCommunities";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ROUND_DURATION = 60;
const RESET_DELAY = 4000;
const ABILITY_COOLDOWN = 30;
const ROPE_SMOOTH = 0.07;
const BOOST_DURATION = 5000;
const FREEZE_DURATION = 3000;
const MAX_OFFSET = 160;

type Team = "red" | "blue";
type Phase = "playing" | "over";

type RoleDef = {
  id: number;
  label: string;
  power: number;
  color: string;
  emoji: string;
  desc: string;
};

// WEB3 SYNC POINT ①: Replace with useAccount() + getPlayerInfo(address)
const ROLES: RoleDef[] = [
  { id: 1, label: "Engineer", power: 2, color: "#facc15", emoji: "⚙️", desc: "2× pull power" },
  { id: 2, label: "Saboteur", power: 1, color: "#f87171", emoji: "❄️", desc: "Freeze rival 3s" },
  { id: 3, label: "Booster", power: 1, color: "#34d399", emoji: "⚡", desc: "2× team power 5s" },
];

function pickRole(): RoleDef {
  const r = Math.random();
  return r < 0.65 ? ROLES[0]! : r < 0.85 ? ROLES[2]! : ROLES[1]!;
}

// ─── DRAW HELPERS ─────────────────────────────────────────────────────────────
function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, "#1e1035");
  sky.addColorStop(0.45, "#4c1d95");
  sky.addColorStop(1, "#9a3412");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.62);

  ctx.save();
  ctx.shadowColor = "#fde68a";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#fef9c3";
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.46, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const g = ctx.createLinearGradient(0, H * 0.62, 0, H);
  g.addColorStop(0, "#78350f");
  g.addColorStop(1, "#1c0a00");
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.62, W, H * 0.38);

  ctx.fillStyle = "#a16207";
  for (let x = 0; x < W; x += 20) ctx.fillRect(x, H * 0.62, 14, 3);

  ctx.fillStyle = "#fef3c7";
  const stars: [number, number][] = [
    [30, 20],
    [90, 14],
    [170, 28],
    [260, 10],
    [340, 22],
    [430, 8],
    [510, 18],
    [580, 26],
    [640, 12],
  ];
  stars.forEach(([sx, sy]) => {
    ctx.fillRect(sx, sy, 2, 2);
  });

  const treeColor: [number, number][] = [
    [50, H * 0.58],
    [140, H * 0.56],
    [W - 60, H * 0.57],
    [W - 155, H * 0.59],
  ];
  treeColor.forEach(([tx, ty]) => {
    ctx.fillStyle = "#0f4c1e";
    ctx.fillRect(tx - 14, ty - 36, 28, 38);
    ctx.fillStyle = "#145a24";
    ctx.fillRect(tx - 18, ty - 56, 36, 22);
    ctx.fillStyle = "#0a3a16";
    ctx.fillRect(tx - 10, ty - 70, 20, 18);
    ctx.fillStyle = "#7c3a0a";
    ctx.fillRect(tx - 5, ty + 2, 10, 14);
  });
}

function drawRope(ctx: CanvasRenderingContext2D, cy: number, offsetX: number, W: number) {
  const segW = 14,
    segH = 8,
    gap = 2,
    left = 55,
    right = W - 55;
  ctx.fillStyle = "#92400e";
  for (let x = left; x < right; x += segW + gap) {
    const sag = Math.sin(((x - left) / (right - left)) * Math.PI) * 7;
    ctx.fillRect(x, cy + sag - segH / 2, segW, segH);
  }
  const mx = W / 2 + offsetX;
  ctx.save();
  ctx.shadowColor = "#fbbf24";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(mx - 4, cy - 20, 8, 40);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(mx - 7, cy - 7, 14, 14);
  ctx.restore();
}

function drawChar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  frozen: boolean,
  imgEl: HTMLImageElement | null
) {
  const S = 52;
  const bx = x - S / 2;
  const by = y - S;
  if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
    const iw = imgEl.naturalWidth;
    const ih = imgEl.naturalHeight;
    const side = Math.min(iw, ih);
    const sx = (iw - side) / 2;
    const sy = (ih - side) / 2;
    if (frozen) ctx.globalAlpha = 0.5;
    ctx.drawImage(imgEl, sx, sy, side, side, bx, by, S, S);
    ctx.globalAlpha = 1;
    if (frozen) {
      ctx.fillStyle = "rgba(147,197,253,0.45)";
      ctx.fillRect(bx, by, S, S);
    }
  } else {
    ctx.fillStyle = frozen ? "#93c5fd" : color;
    ctx.fillRect(bx, by, S, S);
    if (!frozen) {
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(bx, by, S, 4);
      ctx.fillRect(bx, by, 4, S);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(bx + S - 4, by, 4, S);
      ctx.fillRect(bx, by + S - 4, S, 4);
      ctx.fillStyle = "#fff";
      ctx.fillRect(bx + 10, by + 14, 8, 8);
      ctx.fillRect(bx + S - 18, by + 14, 8, 8);
      ctx.fillStyle = "#111";
      ctx.fillRect(bx + 12, by + 16, 4, 4);
      ctx.fillRect(bx + S - 16, by + 16, 4, 4);
      ctx.fillStyle = "#111";
      ctx.fillRect(bx + 12, by + 30, S - 24, 4);
    }
  }
  ctx.font = "bold 10px ui-monospace,monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#000";
  ctx.fillText(label, x + 1, y + 13);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x, y + 12);
}

// ─── COOLDOWN RING ────────────────────────────────────────────────────────────
function CooldownRing({ cd, max, color, size = 72 }: { cd: number; max: number; color: string; size?: number }) {
  const r = size / 2 - 4;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (cd / max);
  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90"
      aria-hidden
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
      {cd > 0 && (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      )}
    </svg>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide"
      style={{
        background: `${color}18`,
        border: `1px solid ${color}55`,
        color,
      }}
    >
      {label}
    </span>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function TugOfWar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const ropeXRef = useRef(0);
  const targetXRef = useRef(0);
  const pullsRef = useRef<number[]>([]);

  const [playerTeam, setPlayerTeam] = useState<Team>("red");
  const [playerRole, setPlayerRole] = useState<RoleDef>(ROLES[0]!);
  const enemyTeam: Team = playerTeam === "red" ? "blue" : "red";

  /** Match /play: explicit rope side + crew (no random team). */
  const [setupComplete, setSetupComplete] = useState(false);
  const [pickRope, setPickRope] = useState<Team | null>(null);
  const [pickCrew, setPickCrew] = useState<CommunityId | null>(null);

  const [scores, setScores] = useState({ red: 0, blue: 0 });
  const [timer, setTimer] = useState(ROUND_DURATION);
  const [phase, setPhase] = useState<Phase>("playing");
  const [winner, setWinner] = useState<Team | null>(null);
  const [sessionWins, setSessionWins] = useState({ red: 0, blue: 0 });

  const [boostActive, setBoostActive] = useState(false);
  const [enemyFrozen, setEnemyFrozen] = useState(false);
  const [playerFrozen, setPlayerFrozen] = useState(false);
  const [cd, setCd] = useState(0);
  const [tps, setTps] = useState(0);
  const [lastPullFlash, setLastPullFlash] = useState(false);

  const phaseRef = useRef(phase);
  const enemyFrozenRef = useRef(false);
  const playerFrozenRef = useRef(false);
  const scoresRef = useRef(scores);
  const roundEndLockRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    enemyFrozenRef.current = enemyFrozen;
  }, [enemyFrozen]);
  useEffect(() => {
    playerFrozenRef.current = playerFrozen;
  }, [playerFrozen]);
  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  useEffect(() => {
    const { red, blue } = scores;
    const total = red + blue || 1;
    const diff = (blue - red) / total;
    targetXRef.current = diff * MAX_OFFSET;
  }, [scores]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxRaw = canvas.getContext("2d");
    if (!ctxRaw) return;
    const ctx = ctxRaw;

    let W = 0;
    let H = 0;
    const resize = () => {
      const p = canvas.parentElement;
      if (!p) return;
      const dpr = window.devicePixelRatio || 1;
      W = p.clientWidth;
      H = p.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", resize);

    const redImg = new Image();
    redImg.src = "/red.png";
    const blueImg = new Image();
    blueImg.src = "/blue.png";
    const bgImg2 = new Image();
    bgImg2.src = "/bg.png";

    function loop() {
      ropeXRef.current += (targetXRef.current - ropeXRef.current) * ROPE_SMOOTH;
      if (bgImg2.complete && bgImg2.naturalWidth > 0) {
        ctx.drawImage(bgImg2, 0, 0, W, H);
      } else {
        drawBg(ctx, W, H);
      }
      const cy = H * 0.55;
      drawRope(ctx, cy, ropeXRef.current, W);
      const rx = W * 0.2 + ropeXRef.current * 0.35;
      const bx = W * 0.8 + ropeXRef.current * 0.35;

      const redFrozen =
        (enemyFrozenRef.current && playerTeam === "blue") || (playerFrozenRef.current && playerTeam === "red");
      const blueFrozen =
        (enemyFrozenRef.current && playerTeam === "red") || (playerFrozenRef.current && playerTeam === "blue");

      drawChar(ctx, rx, cy - 4, "#ef4444", "RED", redFrozen, redImg);
      drawChar(ctx, bx, cy - 4, "#3b82f6", "BLUE", blueFrozen, blueImg);

      ctx.globalAlpha = 0.13;
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(0, 0, 48, H);
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(W - 48, 0, 48, H);
      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(loop);
    }
    animRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [playerTeam, setupComplete]);

  const endRound = useCallback((w: Team | null) => {
    if (phaseRef.current !== "playing" || roundEndLockRef.current) return;
    roundEndLockRef.current = true;
    setPhase("over");
    setWinner(w);
    if (w) setSessionWins((s) => ({ ...s, [w]: s[w] + 1 }));
    setTimeout(() => {
      setScores({ red: 0, blue: 0 });
      targetXRef.current = 0;
      setTimer(ROUND_DURATION);
      setWinner(null);
      setEnemyFrozen(false);
      setPlayerFrozen(false);
      setBoostActive(false);
      setPhase("playing");
      roundEndLockRef.current = false;
    }, RESET_DELAY);
  }, []);

  const checkWin = useCallback(
    (next: { red: number; blue: number }) => {
      const diff = next.blue - next.red;
      const total = next.red + next.blue || 1;
      if (Math.abs(diff) / total > 0.75 && total > 10) {
        endRound(diff > 0 ? "blue" : "red");
      }
    },
    [endRound]
  );

  useEffect(() => {
    if (phase !== "playing") return;
    if (timer <= 0) {
      const s = scoresRef.current;
      endRound(s.red > s.blue ? "red" : s.blue > s.red ? "blue" : null);
      return;
    }
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer, phase, endRound]);

  useEffect(() => {
    if (cd <= 0) return;
    const id = setTimeout(() => setCd((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cd]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      pullsRef.current = pullsRef.current.filter((t) => now - t < 1000);
      setTps(pullsRef.current.length);
    }, 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const schedule = () => {
      const delay = 280 + Math.random() * 340;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        if (phaseRef.current !== "playing" || enemyFrozenRef.current) {
          schedule();
          return;
        }
        setScores((prev) => {
          const next = { ...prev, [enemyTeam]: prev[enemyTeam] + (0.8 + Math.random() * 0.6) };
          checkWin(next);
          return next;
        });
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [phase, enemyTeam, checkWin]);

  const pull = useCallback(() => {
    if (phase !== "playing" || playerFrozen) return;
    if (navigator.vibrate) navigator.vibrate(45);
    pullsRef.current.push(Date.now());
    const power = playerRole.power * (boostActive ? 2 : 1);
    setScores((prev) => {
      const next = { ...prev, [playerTeam]: prev[playerTeam] + power };
      checkWin(next);
      return next;
    });
    setLastPullFlash(true);
    setTimeout(() => setLastPullFlash(false), 120);
  }, [phase, playerFrozen, playerRole, boostActive, playerTeam, checkWin]);

  const useAbility = useCallback(() => {
    if (phase !== "playing" || cd > 0 || playerFrozen) return;
    if (navigator.vibrate) navigator.vibrate([25, 15, 55]);
    if (playerRole.id === 3) {
      setBoostActive(true);
      setTimeout(() => setBoostActive(false), BOOST_DURATION);
    }
    if (playerRole.id === 2) {
      setEnemyFrozen(true);
      setTimeout(() => setEnemyFrozen(false), FREEZE_DURATION);
    }
    setCd(ABILITY_COOLDOWN);
  }, [phase, cd, playerFrozen, playerRole]);

  const isRed = playerTeam === "red";
  const tc = isRed ? "#f87171" : "#60a5fa";
  const tcDark = isRed ? "#ef4444" : "#3b82f6";
  const rivalC = isRed ? "#60a5fa" : "#f87171";
  const pScore = isRed ? scores.red : scores.blue;
  const eScore = isRed ? scores.blue : scores.red;
  const hasAbility = playerRole.id === 2 || playerRole.id === 3;
  const disabled = phase !== "playing" || playerFrozen;
  const total = scores.red + scores.blue || 1;
  const ropeBar = Math.max(2, Math.min(98, 50 + ((scores.blue - scores.red) / total) * 50));
  const timerCrit = timer <= 10 && phase === "playing";

  if (!setupComplete) {
    const crewMeta = pickCrew ? GMONAD_COMMUNITIES.find((c) => c.id === pickCrew) : null;
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-surface-container-low px-4 py-8 text-on-surface">
        <div className="mx-auto w-full max-w-lg space-y-6">
          <div className="text-center">
            <p className="font-label text-[10px] uppercase tracking-[0.35em] text-tertiary">Offline · Gmonad War</p>
            <h1 className="mt-2 font-headline text-2xl font-bold tracking-tight">Pick rope & crew</h1>
            <p className="mt-2 font-body text-sm text-on-surface-variant">Same flow as live play — no chain, local scores only.</p>
          </div>
          <div>
            <p className="mb-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-outline">Rope side</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPickRope("red")}
                className={`rounded-sm border-2 border-dashed py-4 font-headline text-lg font-black ${
                  pickRope === "red" ? "border-red-400 bg-red-950/50" : "border-outline-variant bg-surface-container-high"
                }`}
              >
                RED
              </button>
              <button
                type="button"
                onClick={() => setPickRope("blue")}
                className={`rounded-sm border-2 border-dashed py-4 font-headline text-lg font-black ${
                  pickRope === "blue" ? "border-blue-400 bg-blue-950/50" : "border-outline-variant bg-surface-container-high"
                }`}
              >
                BLUE
              </button>
            </div>
          </div>
          <div>
            <p className="mb-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-outline">Crew</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GMONAD_COMMUNITIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPickCrew(c.id)}
                  className={`rounded-sm border border-dashed px-3 py-2.5 text-left text-sm ${
                    pickCrew === c.id ? "border-primary bg-primary/10" : "border-outline-variant bg-surface-container-high"
                  }`}
                >
                  <span className="mr-2">{c.emoji}</span>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={!pickRope || !pickCrew}
            onClick={() => {
              if (!pickRope || !pickCrew) return;
              setPlayerTeam(pickRope);
              setPlayerRole(pickRole());
              setSetupComplete(true);
            }}
            className="w-full bg-gradient-to-br from-primary to-primary-container py-3.5 font-headline text-sm font-bold uppercase tracking-wide text-on-primary disabled:opacity-40"
          >
            Start match
          </button>
          {crewMeta && pickRope && (
            <p className="text-center font-body text-[11px] text-outline">
              Playing as {crewMeta.name} on {pickRope.toUpperCase()} — offline mock
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 select-none flex-col overflow-hidden bg-surface-container-low font-mono touch-none"
      style={{ touchAction: "none" }}
    >
      <div className="flex shrink-0 justify-center bg-surface-container-low py-0.5 pt-2">
        <div className="glass-panel flex items-center gap-1.5 rounded-full border border-dashed border-outline-variant px-3.5 py-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: phase === "playing" ? "#4ade80" : "#f87171",
              boxShadow: phase === "playing" ? "0 0 6px #4ade80" : undefined,
            }}
          />
          <span className="font-label text-[10px] font-bold tracking-[0.2em] text-on-surface-variant">
            {phase === "playing" ? "MATCH LIVE" : "ROUND OVER"}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 bg-surface-container-low px-2.5 pb-1.5 pt-2">
        <div className="min-w-0 flex-1 rounded-sm border border-dashed border-outline-variant/60 bg-surface-container/80 px-3 py-2.5">
          <div className="mb-1 font-label text-[9px] font-bold tracking-[0.2em] text-on-surface-variant">YOU</div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span
              className="text-[32px] font-black leading-none tracking-tight"
              style={{ color: tc, textShadow: `0 0 24px ${tcDark}55` }}
            >
              {Math.floor(pScore)}
            </span>
            <span className="font-body text-[11px] font-medium text-on-surface-variant">{playerRole.label}</span>
          </div>
          <div className="mt-1 text-[9px] opacity-80" style={{ color: playerRole.color }}>
            {playerTeam.toUpperCase()} TEAM
          </div>
        </div>

        <div className="flex w-20 shrink-0 flex-col items-center justify-center rounded-sm border border-dashed border-primary/35 bg-primary/5 px-1 py-2">
          <div className="mb-0.5 font-label text-[8px] font-bold tracking-[0.25em] text-primary/70">TPS</div>
          <div className="text-[28px] font-black leading-none text-primary">{tps}</div>
          <div className="mt-0.5 font-label text-[8px] text-primary/50">pulls/s</div>
        </div>

        <div className="min-w-0 flex-1 rounded-sm border border-dashed border-outline-variant/60 bg-surface-container/80 px-3 py-2.5 text-right">
          <div className="mb-1 font-label text-[9px] font-bold tracking-[0.2em] text-on-surface-variant">RIVAL</div>
          <div
            className="text-[32px] font-black leading-none tracking-tight"
            style={{
              color: enemyFrozen ? "#93c5fd" : rivalC,
              textShadow: enemyFrozen ? "none" : `0 0 20px ${isRed ? "#3b82f6" : "#ef4444"}40`,
            }}
          >
            {Math.floor(eScore)}
          </div>
          {enemyFrozen ? (
            <div className="mt-1 text-[9px] font-bold text-sky-300">❄ FROZEN</div>
          ) : (
            <div className="mt-1 font-label text-[9px] text-outline">{enemyTeam.toUpperCase()} TEAM</div>
          )}
        </div>
      </div>

      <div className="relative h-2.5 shrink-0 overflow-hidden bg-[#0d0d15]">
        <div
          className="absolute inset-0 bg-gradient-to-r from-red-600 via-violet-600 to-blue-600 opacity-85 transition-[width] duration-100"
          style={{ width: `${ropeBar}%` }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent" />
        <div className="absolute left-1/2 top-1/2 z-[1] h-[calc(100%+4px)] w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-gradient-to-b from-amber-200 to-amber-500 shadow-[0_0_12px_#fbbf2488]" />
      </div>

      <div className="relative min-h-0 flex-1 bg-surface-container-low">
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none [image-rendering:pixelated]"
          style={{ touchAction: "none" }}
        />

        <div className="pointer-events-none absolute left-1/2 top-2.5 flex -translate-x-1/2 flex-col items-center">
          <div
            className="text-4xl font-black leading-none tracking-tight"
            style={{
              color: timerCrit ? "#f87171" : "#fbbf24",
              textShadow: timerCrit ? "0 0 20px #ef4444" : "0 0 12px #f59e0b88",
            }}
          >
            {String(timer).padStart(2, "0")}
          </div>
          <div className="mt-0.5 text-[8px] tracking-[0.2em] text-white/30">
            WINS {sessionWins.red}:{sessionWins.blue}
          </div>
        </div>
      </div>

      {phase === "over" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/78">
          <div
            className="rounded-[20px] border-2 px-12 py-8 text-center"
            style={{
              borderColor: winner === playerTeam ? "#4ade80" : winner ? "#f87171" : "#555",
              background: "#0f0f18",
            }}
          >
            <div className="mb-2 text-[11px] tracking-[0.3em] text-white/40">ROUND OVER</div>
            {winner === playerTeam && (
              <div className="text-4xl font-black text-green-400" style={{ textShadow: "0 0 24px #22c55e" }}>
                YOU WIN!
              </div>
            )}
            {winner && winner !== playerTeam && (
              <div className="text-4xl font-black text-red-400" style={{ textShadow: "0 0 24px #ef4444" }}>
                YOU LOSE
              </div>
            )}
            {!winner && <div className="text-3xl font-bold text-zinc-400">DRAW</div>}
            <div className="mt-3 text-[10px] tracking-wide text-white/28">Next round starting…</div>
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-dashed border-outline-variant bg-gradient-to-b from-surface-container to-surface-container-low px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
        <div className="mb-2 flex min-h-[18px] flex-wrap gap-1.5">
          {playerFrozen && <Pill label="❄ YOU ARE FROZEN" color="#93c5fd" />}
          {boostActive && <Pill label="⚡ BOOST ACTIVE" color="#fbbf24" />}
          {enemyFrozen && <Pill label="❄ RIVAL FROZEN" color="#4ade80" />}
        </div>

        <div className="flex items-stretch gap-2.5">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              pull();
            }}
            disabled={disabled}
            className="min-h-[76px] flex-1 rounded-[18px] border-2 font-mono text-[22px] font-black tracking-wide transition-[transform,box-shadow] duration-100 touch-none select-none disabled:cursor-not-allowed"
            style={{
              background: disabled
                ? "rgba(255,255,255,0.03)"
                : `linear-gradient(180deg,${tcDark}30 0%,${tcDark}0e 50%,rgba(0,0,0,0.2) 100%)`,
              borderColor: disabled ? "rgba(255,255,255,0.09)" : tcDark,
              color: disabled ? "rgba(255,255,255,0.22)" : tc,
              boxShadow: disabled ? "none" : `0 0 30px ${tcDark}30,inset 0 1px 0 rgba(255,255,255,0.1)`,
              transform: lastPullFlash ? "scale(0.97)" : "scale(1)",
            }}
          >
            {playerFrozen ? "❄ FROZEN" : "PULL"}
          </button>

          {hasAbility && (
            <div className="relative h-[76px] w-[76px] shrink-0">
              <CooldownRing cd={cd} max={ABILITY_COOLDOWN} color={tcDark} size={76} />
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  useAbility();
                }}
                disabled={cd > 0 || disabled}
                className="absolute inset-[5px] flex flex-col items-center justify-center gap-0.5 rounded-[14px] border-2 font-mono touch-none select-none disabled:cursor-not-allowed"
                style={{
                  background:
                    cd > 0 || disabled
                      ? "rgba(255,255,255,0.03)"
                      : `linear-gradient(180deg,${tcDark}38 0%,${tcDark}10 100%)`,
                  borderColor: cd > 0 || disabled ? "rgba(255,255,255,0.09)" : tcDark,
                  color: cd > 0 || disabled ? "rgba(255,255,255,0.28)" : tc,
                  boxShadow: cd > 0 || disabled ? "none" : `0 0 20px ${tcDark}28`,
                }}
              >
                {cd > 0 ? (
                  <>
                    <span className="text-xl font-black leading-none">{cd}</span>
                    <span className="text-[8px] opacity-50">s</span>
                  </>
                ) : (
                  <>
                    <span className="text-[22px] leading-none">{playerRole.emoji}</span>
                    <span className="text-[8px] font-bold tracking-wide">
                      {playerRole.id === 3 ? "BOOST" : "FREEZE"}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div
          className="mt-2 text-center text-[9px] tracking-wide opacity-50"
          style={{ color: playerRole.color }}
        >
          {playerRole.label.toUpperCase()} — {playerRole.desc}
        </div>
      </div>
    </div>
  );
}
