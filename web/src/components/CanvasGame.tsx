"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import { ROLE_META, type RoleId, type TeamId, TEAMS } from "@/utils/constants";
import TpsDisplay from "@/components/TpsDisplay";

const ROPE_SMOOTH = 0.08;
const ABILITY_COOLDOWN = 30;
/** On-canvas character size (square); source art is center-cropped to a square when needed */
const SPRITE_PX = 48;

let bgImg: HTMLImageElement | null = null;
let redImg: HTMLImageElement | null = null;
let blueImg: HTMLImageElement | null = null;

if (typeof window !== "undefined") {
  bgImg = new Image();
  bgImg.src = "/bg.png";
  redImg = new Image();
  redImg.src = "/red.png";
  blueImg = new Image();
  blueImg.src = "/blue.png";
}

function drawRope(ctx: CanvasRenderingContext2D, cy: number, ropeX: number, W: number) {
  const segW = 12,
    segH = 8,
    gap = 2;
  const ropeLeft = 60,
    ropeRight = W - 60;
  ctx.fillStyle = "#92400e";
  for (let x = ropeLeft; x < ropeRight; x += segW + gap) {
    const sag = Math.sin(((x - ropeLeft) / (ropeRight - ropeLeft)) * Math.PI) * 6;
    ctx.fillRect(x, cy + sag - segH / 2, segW, segH);
  }
  const mx = W / 2 + ropeX;
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(mx - 4, cy - 18, 8, 36);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(mx - 6, cy - 6, 12, 12);
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  frozen: boolean,
  team: string
) {
  const img = team === "red" ? redImg : blueImg;
  const half = SPRITE_PX / 2;
  const bx = x - half;
  // Anchor: sprite bottom ~8px below y (rope contact), same as before relative to feet
  const by = y - SPRITE_PX + 8;

  if (img && img.complete) {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (frozen) ctx.globalAlpha = 0.6;
    if (iw > 0 && ih > 0) {
      const side = Math.min(iw, ih);
      const sx = (iw - side) / 2;
      const sy = (ih - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, bx, by, SPRITE_PX, SPRITE_PX);
    } else {
      ctx.drawImage(img, bx, by, SPRITE_PX, SPRITE_PX);
    }
    if (frozen) {
      ctx.fillStyle = "rgba(147, 197, 253, 0.4)";
      ctx.fillRect(bx, by, SPRITE_PX, SPRITE_PX);
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, SPRITE_PX, SPRITE_PX);
  }

  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 12);
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number) {
  if (bgImg && bgImg.complete) {
    ctx.drawImage(bgImg, 0, 0, W, H);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, "#4c1d95");
    sky.addColorStop(1, "#9a3412");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.55);
    const ground = ctx.createLinearGradient(0, H * 0.55, 0, H);
    ground.addColorStop(0, "#78350f");
    ground.addColorStop(1, "#451a03");
    ctx.fillStyle = ground;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
  }
}

interface CanvasGameProps {
  game: {
    redScore: number;
    blueScore: number;
    redBoosted: boolean;
    blueBoosted: boolean;
    redSabotaged: boolean;
    blueSabotaged: boolean;
  };
  team: TeamId;
  roleId: RoleId;
  eventCount: number;
  onPull: () => void;
  onSabotage: () => void;
  onBoost: () => void;
  txStatus: { msg: string; type: "pending" | "ok" | "err" } | null;
}

export default function CanvasGame({
  game,
  team,
  roleId,
  eventCount,
  onPull,
  onSabotage,
  onBoost,
  txStatus,
}: CanvasGameProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const ropeXRef = useRef(0);
  const targetXRef = useRef(0);

  const isRed = team === TEAMS.RED;
  const playerTeamStr = isRed ? "red" : "blue";
  const enemyTeamStr = isRed ? "blue" : "red";

  const playerScore = isRed ? game.redScore : game.blueScore;
  const enemyScore = isRed ? game.blueScore : game.redScore;

  const playerFrozen = isRed ? game.redSabotaged : game.blueSabotaged;
  const enemyFrozen = isRed ? game.blueSabotaged : game.redSabotaged;
  const boostActive = isRed ? game.redBoosted : game.blueBoosted;

  const roleMeta = ROLE_META[roleId];
  const hasAbility = roleId === 2 || roleId === 3;

  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const diffOriginal = game.blueScore - game.redScore;
    const wrap = wrapRef.current;
    const maxRopeOffset = wrap ? wrap.clientWidth / 3 : typeof window !== "undefined" ? window.innerWidth / 3 : 150;
    const total = game.redScore + game.blueScore || 1;
    const percentDiff = diffOriginal / total;
    targetXRef.current = percentDiff * maxRopeOffset;
  }, [game.redScore, game.blueScore]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxRaw = canvas.getContext("2d");
    if (!ctxRaw) return;
    const ctx = ctxRaw;

    let w = 0;
    let h = 0;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      w = parent.clientWidth;
      h = parent.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(() => resize());
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", resize);

    function loop() {
      ropeXRef.current += (targetXRef.current - ropeXRef.current) * ROPE_SMOOTH;
      drawBackground(ctx, w, h);
      const ropeCY = h * 0.52;
      drawRope(ctx, ropeCY, ropeXRef.current, w);
      const redX = w * 0.18 + ropeXRef.current * 0.4;
      const blueX = w * 0.82 + ropeXRef.current * 0.4;
      drawCharacter(ctx, redX, ropeCY - 8, "#ef4444", "RED", game.redSabotaged, "red");
      drawCharacter(ctx, blueX, ropeCY - 8, "#3b82f6", "BLUE", game.blueSabotaged, "blue");
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(0, 0, 44, h);
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(w - 44, 0, 44, h);
      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(loop);
    }
    animRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [game.redSabotaged, game.blueSabotaged]);

  const handleAbility = useCallback(() => {
    if (cooldown > 0 || playerFrozen) return;
    if (navigator.vibrate) navigator.vibrate([30, 20, 60]);
    if (roleId === 3) onBoost();
    if (roleId === 2) onSabotage();
    setCooldown(ABILITY_COOLDOWN);
  }, [cooldown, playerFrozen, roleId, onBoost, onSabotage]);

  const handlePull = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (playerFrozen) return;
      onPull();
    },
    [playerFrozen, onPull]
  );

  const isDisabled = playerFrozen;
  const teamColor = isRed ? "#f87171" : "#60a5fa";
  const teamColorDark = isRed ? "#ef4444" : "#3b82f6";
  const ropePercent = Math.max(
    0,
    Math.min(
      100,
      50 +
        (game.redScore > game.blueScore ? -1 : 1) *
          (Math.abs(game.redScore - game.blueScore) / (game.redScore + game.blueScore || 1)) *
          50
    )
  );

  const rivalColor = isRed ? "#60a5fa" : "#f87171";

  return (
    <div
      ref={wrapRef}
      className="game-card-shell mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-b from-[#12121a] to-[#070709]"
    >
      {/* HUD */}
      <div className="flex shrink-0 items-stretch gap-2 border-b border-white/[0.07] px-2.5 py-3 sm:gap-3 sm:px-4 sm:py-3.5">
        <div className="min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm sm:px-3.5">
          <div className="font-orbitron text-[9px] font-bold uppercase tracking-[0.2em] text-white/38">You</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className="font-orbitron text-[1.65rem] font-black leading-none tabular-nums tracking-tight sm:text-[1.85rem]"
              style={{
                color: teamColor,
                textShadow: isDisabled ? "none" : `0 0 28px ${teamColorDark}55`,
              }}
            >
              {Math.floor(playerScore)}
            </span>
            <span className="max-w-full truncate text-[11px] font-medium text-white/50">{roleMeta.label}</span>
          </div>
        </div>

        <div className="flex w-[5.5rem] shrink-0 flex-col items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.07] px-1 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:w-[6.25rem]">
          <span className="font-orbitron text-[8px] font-bold uppercase tracking-[0.25em] text-indigo-300/70">TPS</span>
          <div className="mt-0.5">
            <TpsDisplay eventCount={eventCount} compact hideUnit />
          </div>
        </div>

        <div className="min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm sm:px-3.5">
          <div className="font-orbitron text-[9px] font-bold uppercase tracking-[0.2em] text-white/38">Rival</div>
          <div
            className="font-orbitron mt-1 text-[1.65rem] font-black leading-none tabular-nums tracking-tight sm:text-[1.85rem]"
            style={{
              color: rivalColor,
              textShadow: enemyFrozen ? "none" : `0 0 24px ${isRed ? "#3b82f6" : "#ef4444"}40`,
            }}
          >
            {Math.floor(enemyScore)}
          </div>
          {enemyFrozen && (
            <div className="mt-1 inline-block rounded-md border border-sky-400/25 bg-sky-500/10 px-1.5 py-0.5 font-orbitron text-[9px] font-bold uppercase tracking-wider text-sky-200/95">
              Frozen
            </div>
          )}
        </div>
      </div>

      {/* Tug meter */}
      <div className="relative h-2.5 shrink-0 overflow-hidden bg-black/50">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600 via-violet-600 to-blue-600 opacity-90 transition-[width] duration-100"
          style={{ width: `${ropePercent}%` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />
        <div className="absolute left-1/2 top-1/2 z-[1] h-[calc(100%+6px)] w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-amber-200 via-amber-300 to-amber-500 shadow-[0_0_14px_rgba(251,191,36,0.75),0_0_4px_rgba(255,255,255,0.35)]" />
      </div>

      {/* Canvas — bounded height; draw resolution unchanged in CanvasGame logic */}
      <div
        className="game-canvas-frame relative min-h-0 w-full flex-[1_1_auto] overflow-hidden bg-[#050508]"
        style={{ height: "min(42vh, 360px)" }}
      >
        <canvas ref={canvasRef} className="block h-full w-full touch-none" style={{ touchAction: "none" }} />
        {txStatus && (
          <div
            className={`absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-xl border px-3.5 py-2.5 text-center text-xs shadow-lg backdrop-blur-md ${
              txStatus.type === "err"
                ? "border-red-500/45 bg-red-950/40 text-red-200"
                : txStatus.type === "ok"
                  ? "border-emerald-500/35 bg-emerald-950/35 text-emerald-100/95"
                  : "border-white/12 bg-black/50 text-white/60"
            }`}
          >
            {txStatus.msg}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 border-t border-white/[0.07] bg-gradient-to-b from-[#0c0c10] to-[#050506] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pt-3.5">
        <div className="mb-2.5 flex min-h-[1.25rem] flex-wrap gap-2">
          {playerFrozen && (
            <span className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-200/90">
              Frozen — pull disabled
            </span>
          )}
          {boostActive && (
            <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200/90">
              Boost active
            </span>
          )}
          {enemyFrozen && (
            <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200/85">
              Rival frozen
            </span>
          )}
        </div>

        <div className="flex gap-2.5 sm:gap-3">
          <button
            type="button"
            onPointerDown={handlePull}
            disabled={isDisabled}
            className="group relative flex min-h-[72px] flex-1 touch-none select-none items-center justify-center overflow-hidden rounded-2xl border-2 text-base font-orbitron font-bold uppercase tracking-[0.12em] transition-[transform,filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506] active:translate-y-px active:scale-[0.99] disabled:pointer-events-none sm:min-h-[76px] sm:text-lg"
            style={{
              background: isDisabled
                ? "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)"
                : `linear-gradient(180deg, ${teamColorDark}35 0%, ${teamColorDark}12 45%, rgba(0,0,0,0.25) 100%)`,
              borderColor: isDisabled ? "rgba(255,255,255,0.1)" : teamColorDark,
              color: isDisabled ? "rgba(255,255,255,0.28)" : teamColor,
              cursor: isDisabled ? "not-allowed" : "pointer",
              boxShadow: isDisabled
                ? "none"
                : `0 0 32px ${teamColorDark}35, inset 0 1px 0 rgba(255,255,255,0.12)`,
            }}
          >
            {!isDisabled && (
              <span
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{
                  background: `linear-gradient(180deg, transparent 0%, ${teamColorDark}22 100%)`,
                }}
              />
            )}
            <span className="relative z-[1] drop-shadow-sm">{playerFrozen ? "Frozen" : "Pull"}</span>
          </button>

          {hasAbility && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                handleAbility();
              }}
              disabled={cooldown > 0 || playerFrozen}
              className="relative flex h-[72px] w-[72px] shrink-0 touch-none select-none flex-col items-center justify-center overflow-hidden rounded-2xl border-2 text-[9px] font-orbitron font-bold uppercase tracking-wider transition-[transform,filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506] active:translate-y-px active:scale-[0.99] disabled:pointer-events-none sm:h-[76px] sm:w-[76px]"
              style={{
                background:
                  cooldown > 0 || playerFrozen
                    ? "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)"
                    : `linear-gradient(180deg, ${teamColorDark}40 0%, ${teamColorDark}14 50%, rgba(0,0,0,0.2) 100%)`,
                borderColor: cooldown > 0 || playerFrozen ? "rgba(255,255,255,0.1)" : teamColorDark,
                color: cooldown > 0 || playerFrozen ? "rgba(255,255,255,0.32)" : teamColor,
                cursor: cooldown > 0 || playerFrozen ? "not-allowed" : "pointer",
                boxShadow:
                  cooldown > 0 || playerFrozen
                    ? "none"
                    : `0 0 24px ${teamColorDark}30, inset 0 1px 0 rgba(255,255,255,0.1)`,
              }}
            >
              {cooldown > 0 ? (
                <>
                  <span className="font-orbitron text-lg font-black">{cooldown}</span>
                  <span className="opacity-60">s</span>
                </>
              ) : (
                <>
                  <span className="text-xl leading-none drop-shadow-sm">{roleId === 3 ? "⚡" : "❄"}</span>
                  <span className="mt-1 opacity-95">{roleId === 3 ? "Boost" : "Freeze"}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
