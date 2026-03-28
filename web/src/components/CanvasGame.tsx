"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import { ROLE_META, type RoleId, type TeamId, TEAMS } from "@/utils/constants";
import TpsDisplay from "@/components/TpsDisplay";

const ROPE_SMOOTH = 0.08;
const ABILITY_COOLDOWN = 30;

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
  const bx = x - 24,
    by = y - 56;

  if (img && img.complete) {
    if (frozen) ctx.globalAlpha = 0.6;
    ctx.drawImage(img, bx, by, 48, 64);
    if (frozen) {
      ctx.fillStyle = "rgba(147, 197, 253, 0.4)";
      ctx.fillRect(bx, by, 48, 64);
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, 48, 64);
  }

  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 16);
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

  return (
    <div
      ref={wrapRef}
      className="mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0c] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)]"
    >
      {/* HUD */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-wider text-white/40">You</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums" style={{ color: teamColor }}>
              {Math.floor(playerScore)}
            </span>
            <span className="truncate text-[11px] text-white/45">{roleMeta.label}</span>
          </div>
        </div>

        <div className="flex flex-col items-center px-1">
          <span className="text-[9px] font-medium uppercase tracking-wider text-white/35">TPS</span>
          <TpsDisplay eventCount={eventCount} compact />
        </div>

        <div className="min-w-0 flex-1 text-right">
          <div className="text-[10px] font-medium uppercase tracking-wider text-white/40">Rival</div>
          <div className="text-2xl font-semibold tabular-nums" style={{ color: isRed ? "#60a5fa" : "#f87171" }}>
            {Math.floor(enemyScore)}
          </div>
          {enemyFrozen && <div className="text-[10px] text-sky-300/90">Frozen</div>}
        </div>
      </div>

      {/* Tug meter */}
      <div className="relative h-2 shrink-0 bg-white/[0.06]">
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-600 to-blue-600 transition-[width] duration-100"
          style={{ width: `${ropePercent}%` }}
        />
        <div className="absolute left-1/2 top-0 z-[1] h-full w-0.5 -translate-x-1/2 bg-amber-400/90" />
      </div>

      {/* Canvas — bounded height, not full viewport */}
      <div className="relative min-h-0 w-full flex-[1_1_auto] overflow-hidden" style={{ height: "min(42vh, 360px)" }}>
        <canvas ref={canvasRef} className="block h-full w-full touch-none" style={{ touchAction: "none" }} />
        {txStatus && (
          <div
            className={`absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg border px-3 py-2 text-center text-xs backdrop-blur-md ${
              txStatus.type === "err"
                ? "border-red-500/50 text-red-300"
                : txStatus.type === "ok"
                  ? "border-emerald-500/40 text-emerald-200/90"
                  : "border-white/15 text-white/55"
            }`}
          >
            {txStatus.msg}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#060608] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-4">
        <div className="mb-2 flex min-h-[1.25rem] flex-wrap gap-2">
          {playerFrozen && (
            <span className="text-[10px] font-medium text-sky-300/90">Frozen — pull disabled</span>
          )}
          {boostActive && <span className="text-[10px] font-medium text-amber-300/90">Boost active</span>}
          {enemyFrozen && <span className="text-[10px] font-medium text-emerald-400/80">Rival frozen</span>}
        </div>

        <div className="flex gap-2 sm:gap-3">
          <button
            type="button"
            onPointerDown={handlePull}
            className="flex min-h-[72px] flex-1 touch-none select-none items-center justify-center rounded-xl border-2 text-base font-semibold tracking-wide transition active:scale-[0.98] sm:min-h-[76px] sm:text-lg"
            style={{
              background: isDisabled ? "rgba(255,255,255,0.04)" : `${teamColorDark}18`,
              borderColor: isDisabled ? "rgba(255,255,255,0.08)" : teamColorDark,
              color: isDisabled ? "rgba(255,255,255,0.25)" : teamColor,
              cursor: isDisabled ? "not-allowed" : "pointer",
              boxShadow: isDisabled ? "none" : `0 0 20px ${teamColorDark}22`,
            }}
          >
            {playerFrozen ? "Frozen" : "Pull"}
          </button>

          {hasAbility && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                handleAbility();
              }}
              className="flex h-[72px] w-[72px] shrink-0 touch-none select-none flex-col items-center justify-center rounded-xl border-2 text-[10px] font-medium transition active:scale-[0.98] sm:h-[76px] sm:w-[76px]"
              style={{
                background:
                  cooldown > 0 || playerFrozen ? "rgba(255,255,255,0.04)" : `${teamColorDark}24`,
                borderColor: cooldown > 0 || playerFrozen ? "rgba(255,255,255,0.08)" : teamColorDark,
                color: cooldown > 0 || playerFrozen ? "rgba(255,255,255,0.3)" : teamColor,
                cursor: cooldown > 0 ? "not-allowed" : "pointer",
              }}
            >
              {cooldown > 0 ? (
                <>
                  <span className="text-lg font-semibold">{cooldown}</span>
                  <span className="opacity-70">s</span>
                </>
              ) : (
                <>
                  <span className="text-xl">{roleId === 3 ? "⚡" : "❄"}</span>
                  <span className="mt-0.5 uppercase opacity-90">{roleId === 3 ? "Boost" : "Freeze"}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
