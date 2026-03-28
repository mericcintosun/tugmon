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
  const segW = 12, segH = 8, gap = 2;
  const ropeLeft = 60, ropeRight = W - 60;
  ctx.fillStyle = "#92400e";
  for (let x = ropeLeft; x < ropeRight; x += segW + gap) {
    const sag = Math.sin((x - ropeLeft) / (ropeRight - ropeLeft) * Math.PI) * 6;
    ctx.fillRect(x, cy + sag - segH / 2, segW, segH);
  }
  const mx = W / 2 + ropeX;
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(mx - 4, cy - 18, 8, 36);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(mx - 6, cy - 6, 12, 12);
}

function drawCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string, frozen: boolean, team: string) {
  const img = team === "red" ? redImg : blueImg;
  const bx = x - 24, by = y - 56;
  
  if (img && img.complete) {
    if (frozen) ctx.globalAlpha = 0.6;
    ctx.drawImage(img, bx, by, 48, 64);
    if (frozen) {
      ctx.fillStyle = "rgba(147, 197, 253, 0.4)";
      ctx.fillRect(bx, by, 48, 64);
    }
    ctx.globalAlpha = 1;
  } else {
    // Fallback
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, 48, 64);
  }
  
  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px 'Courier New'";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 16);
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number) {
  if (bgImg && bgImg.complete) {
    ctx.drawImage(bgImg, 0, 0, W, H);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, "#7c3aed");
    sky.addColorStop(1, "#c2410c");
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
  txStatus: { msg: string; type: 'pending'|'ok'|'err' } | null;
}

export default function CanvasGame({
  game, team, roleId, eventCount, onPull, onSabotage, onBoost, txStatus
}: CanvasGameProps) {
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
  const hasAbility = roleId === 2 || roleId === 3; // Booster or Saboteur
  // Roles: 1: ENGINEER, 2: SABOTEUR, 3: BOOSTER
  
  const [cooldown, setCooldown] = useState(0);

  // Smooth rope pos logic
  useEffect(() => {
    // Dynamic diff scaled back
    // Target is scaled diff: if blue is winning, rope moves right (positive diff)
    const diffOriginal = game.blueScore - game.redScore;
    // Scale it to be maximum W/3 based on total. If difference is big, visual limits cap it.
    const maxRopeOffset = typeof window !== 'undefined' ? window.innerWidth / 3 : 150;
    const total = game.redScore + game.blueScore || 1;
    const percentDiff = diffOriginal / total;
    targetXRef.current = percentDiff * maxRopeOffset;
  }, [game.redScore, game.blueScore]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    let w = 0; let h = 0;
    const resize = () => { 
        w = canvas.offsetWidth; 
        h = canvas.offsetHeight;
        canvas.width = w * window.devicePixelRatio;
        canvas.height = h * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    function loop() {
      ropeXRef.current += (targetXRef.current - ropeXRef.current) * ROPE_SMOOTH;
      drawBackground(ctx!, w, h);
      const ropeCY = h * 0.52;
      drawRope(ctx!, ropeCY, ropeXRef.current, w);
      const redX = w * 0.18 + ropeXRef.current * 0.4;
      const blueX = w * 0.82 + ropeXRef.current * 0.4;
      drawCharacter(ctx!, redX, ropeCY - 8, "#ef4444", "RED", game.redSabotaged, "red");
      drawCharacter(ctx!, blueX, ropeCY - 8, "#3b82f6", "BLUE", game.blueSabotaged, "blue");
      ctx!.globalAlpha = 0.18;
      ctx!.fillStyle = "#ef4444"; ctx!.fillRect(0, 0, 50, h);
      ctx!.fillStyle = "#3b82f6"; ctx!.fillRect(w-50, 0, 50, h);
      ctx!.globalAlpha = 1;
      animRef.current = requestAnimationFrame(loop);
    }
    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", resize); };
  }, [game.redSabotaged, game.blueSabotaged]);

  const handleAbility = useCallback(() => {
    if (cooldown > 0 || playerFrozen) return;
    if (navigator.vibrate) navigator.vibrate([30, 20, 60]);
    if (roleId === 3) onBoost();
    if (roleId === 2) onSabotage();
    setCooldown(ABILITY_COOLDOWN);
  }, [cooldown, playerFrozen, roleId, onBoost, onSabotage]);

  const handlePull = useCallback((e: React.PointerEvent) => {
      e.preventDefault();
      if (playerFrozen) return;
      onPull();
  }, [playerFrozen, onPull]);

  const isDisabled = playerFrozen;
  const teamColor = isRed ? "#ef4444" : "#3b82f6";
  const ropePercent = Math.max(0, Math.min(100, 50 + (game.redScore > game.blueScore ? -1 : 1) * (Math.abs(game.redScore-game.blueScore) / (game.redScore+game.blueScore||1)) * 50));
  
  const px = { fontFamily: "'Courier New', monospace", letterSpacing: "0.05em" };

  return (
    <div style={{ width: "100%", height: "100%", background: "#0f0f0f", display: "flex", flexDirection: "column", overflow: "hidden", userSelect: "none", touchAction: "none" }}>

      {/* ── HUD ── */}
      <div style={{ ...px, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", background: "#111", borderBottom: "2px solid #222", flexShrink: 0 }}>
        {/* Player side */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 80 }}>
          <div style={{ color: teamColor, fontSize: 10, fontWeight: "bold" }}>{isRed ? "◀ " : ""}YOU ({playerTeamStr.toUpperCase()})</div>
          <div style={{ color: teamColor, fontSize: 26, fontWeight: "bold", lineHeight: 1 }}>{Math.floor(playerScore)}</div>
          <div style={{ color: roleMeta.color === 'red' ? '#f87171' : roleMeta.color === 'sky' ? '#7dd3fc' : '#fde047', fontSize: 9 }}>{roleMeta.label}</div>
        </div>

        {/* Info */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
           <div style={{ color: "#555", fontSize: 10, marginBottom: 2 }}>TPS</div>
           <TpsDisplay eventCount={eventCount} compact />
        </div>

        {/* Enemy side */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 80 }}>
          <div style={{ color: isRed ? "#3b82f6" : "#ef4444", fontSize: 10, fontWeight: "bold" }}>ENEMY ({enemyTeamStr.toUpperCase()}){isRed ? "" : " ▶"}</div>
          <div style={{ color: isRed ? "#3b82f6" : "#ef4444", fontSize: 26, fontWeight: "bold", lineHeight: 1 }}>{Math.floor(enemyScore)}</div>
          {enemyFrozen && <div style={{ color: "#93c5fd", fontSize: 9 }}>❄ FROZEN</div>}
        </div>
      </div>

      {/* ── ROPE BAR ── */}
      <div style={{ height: 10, background: "#1a1a1a", position: "relative", flexShrink: 0 }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: `${ropePercent}%`, height: "100%", background: "linear-gradient(90deg,#ef4444,#3b82f6)", transition: "width 0.1s" }} />
        <div style={{ position: "absolute", left: "50%", top: 0, width: 3, height: "100%", background: "#fbbf24", transform: "translateX(-50%)" }} />
      </div>

      {/* ── CANVAS ── */}
      <div style={{ flex: 1, position: "relative" }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: 'none' }} />
        {txStatus && (
            <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded border bg-black/60 backdrop-blur ${txStatus.type === 'err' ? 'border-red-500 text-red-500' : 'border-white/20 text-white/50'}`}>
                {txStatus.msg}
            </div>
        )}
      </div>

      {/* ── INTERACTION BAR ── */}
      <div style={{ background: "#0a0a0a", borderTop: "2px solid #222", padding: "10px 14px 14px", flexShrink: 0, paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}>

        {/* Status chips row */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8, minHeight: 18 }}>
          {playerFrozen  && <span style={{ fontSize: 10, color: '#93c5fd' }}>❄ YOU ARE FROZEN</span>}
          {boostActive   && <span style={{ fontSize: 10, color: '#fbbf24' }}>⚡ BOOST ACTIVE</span>}
          {enemyFrozen   && <span style={{ fontSize: 10, color: '#34d399' }}>❄ ENEMY FROZEN</span>}
        </div>

        {/* Buttons row */}
        <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
          {/* PULL */}
          <button
            onPointerDown={handlePull}
            style={{
              flex: 1, height: 80,
              background: isDisabled ? "#161616" : `${teamColor}1a`,
              border: `2px solid ${isDisabled ? "#2a2a2a" : teamColor}`,
              color: isDisabled ? "#333" : teamColor,
              fontSize: 26, fontWeight: "bold", fontFamily: "'Courier New', monospace",
              letterSpacing: "0.12em", borderRadius: 4, cursor: isDisabled ? "not-allowed" : "pointer",
              boxShadow: isDisabled ? "none" : `0 0 18px ${teamColor}33`,
              touchAction: "none", userSelect: "none",
            }}
          >
            {playerFrozen ? "❄ FROZEN" : "PULL"}
          </button>

          {/* Ability */}
          {hasAbility && (
            <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
              <button
                onPointerDown={e => { e.preventDefault(); handleAbility(); }}
                style={{
                  position: "absolute", inset: 0,
                  background: cooldown > 0 || playerFrozen ? "#111" : `${teamColor}2a`,
                  border: `2px solid ${cooldown > 0 || playerFrozen ? "#2a2a2a" : teamColor}`,
                  color: cooldown > 0 || playerFrozen ? "#444" : teamColor,
                  fontSize: 9, fontFamily: "'Courier New', monospace",
                  borderRadius: 3, cursor: cooldown > 0 ? "not-allowed" : "pointer",
                  touchAction: "none", userSelect: "none",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 2,
                }}
              >
                {cooldown > 0
                  ? <><span style={{ fontSize: 18, fontWeight: "bold" }}>{cooldown}</span><span style={{ fontSize: 8 }}>CD</span></>
                  : <><span style={{ fontSize: 22 }}>{roleId === 3 ? "⚡" : "❄"}</span><span style={{ fontSize: 8 }}>{roleId === 3 ? "BOOST" : "FREEZE"}</span></>
                }
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
