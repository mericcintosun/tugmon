"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const IMG_RED =
  "https://api.dicebear.com/7.x/pixel-art/svg?seed=tugmon-landing-red-witch&backgroundColor=b91c1c";
const IMG_BLUE =
  "https://api.dicebear.com/7.x/pixel-art/svg?seed=tugmon-landing-blue-cat&backgroundColor=1d4ed8";

export type ArenaCanvasProps = {
  isActive: boolean;
  /** N×N mini spectators drawn on each stand when session is active (clamped 10–50). */
  crowdPerSide: number;
  /** True when contract scores show an active tug (sum > 0). */
  onChainMatchPlaying: boolean;
  knotTargetPct: number;
  redScore: number;
  blueScore: number;
  redBoostActive: boolean;
  blueBoostActive: boolean;
  redSabotaged: boolean;
  blueSabotaged: boolean;
  scoresSource: "chain" | "demo";
};

type DrawState = {
  isActive: boolean;
  crowdPerSide: number;
  onChainMatchPlaying: boolean;
  knotTargetPct: number;
  redScore: number;
  blueScore: number;
  redBoostActive: boolean;
  blueBoostActive: boolean;
  redSabotaged: boolean;
  blueSabotaged: boolean;
  scoresSource: "chain" | "demo";
};

export default function ArenaCanvas({
  isActive,
  crowdPerSide,
  onChainMatchPlaying,
  knotTargetPct,
  redScore,
  blueScore,
  redBoostActive,
  blueBoostActive,
  redSabotaged,
  blueSabotaged,
  scoresSource,
}: ArenaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const knotSmooth = useRef(50);
  const drawRef = useRef<DrawState>({
    isActive,
    crowdPerSide,
    onChainMatchPlaying,
    knotTargetPct,
    redScore,
    blueScore,
    redBoostActive,
    blueBoostActive,
    redSabotaged,
    blueSabotaged,
    scoresSource,
  });
  const imgRed = useRef<HTMLImageElement | null>(null);
  const imgBlue = useRef<HTMLImageElement | null>(null);
  const visibleRef = useRef(true);
  const rafRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFrameAt = useRef(0);
  const animTimeRef = useRef(0);

  useLayoutEffect(() => {
    drawRef.current = {
      isActive,
      crowdPerSide,
      onChainMatchPlaying,
      knotTargetPct,
      redScore,
      blueScore,
      redBoostActive,
      blueBoostActive,
      redSabotaged,
      blueSabotaged,
      scoresSource,
    };
  });

  useEffect(() => {
    const a = new Image();
    a.crossOrigin = "anonymous";
    a.src = IMG_RED;
    const b = new Image();
    b.crossOrigin = "anonymous";
    b.src = IMG_BLUE;
    imgRed.current = a;
    imgBlue.current = b;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        visibleRef.current = e ? e.isIntersecting : true;
      },
      { rootMargin: "80px", threshold: 0.01 }
    );
    io.observe(wrap);

    const onVis = () => {
      visibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      width = Math.max(320, rect.width);
      height = Math.max(260, Math.min(480, rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(wrap);
    resize();

    const drawSky = (w: number, h: number) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#2d1b4e");
      g.addColorStop(0.35, "#7c3a6e");
      g.addColorStop(0.55, "#e85d4c");
      g.addColorStop(0.72, "#ffb347");
      g.addColorStop(1, "#1a0a18");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };

    const drawSun = (w: number, horizon: number) => {
      const cx = w * 0.5;
      const cy = horizon + 8;
      const grd = ctx.createRadialGradient(cx, cy, 4, cx, cy, 48);
      grd.addColorStop(0, "#fff9c4");
      grd.addColorStop(0.4, "#ffeb3b");
      grd.addColorStop(1, "rgba(255, 200, 40, 0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, 44, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawForest = (w: number, h: number, groundY: number) => {
      ctx.fillStyle = "#0a040e";
      const n = 36;
      for (let i = 0; i < n; i++) {
        const x = (i / n) * w;
        const treeH = 32 + ((Math.sin(i * 1.73) * 0.5 + 0.5) * 52);
        const bw = w / n + 1.5;
        ctx.fillRect(x, groundY - treeH, bw, treeH);
      }
    };

    const drawTopBar = (w: number, splitPx: number) => {
      const bh = 7;
      const split = Math.max(0, Math.min(w, splitPx));
      const lg = ctx.createLinearGradient(0, 0, split, 0);
      lg.addColorStop(0, "#ef4444");
      lg.addColorStop(0.45, "#a855f7");
      lg.addColorStop(1, "#3b82f6");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, split, bh);
      ctx.fillStyle = "#0a0a12";
      ctx.fillRect(split, 0, w - split, bh);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(Math.max(0, split - 1.5), 0, 3, bh);
    };

    const drawSegmentedRope = (x0: number, x1: number, y: number) => {
      if (x1 <= x0 + 2) return;
      const seg = 7;
      const brown = "#78350f";
      const hi = "#b45309";
      let x = x0;
      while (x < x1 - 1) {
        const wseg = Math.min(seg, x1 - x);
        ctx.fillStyle = brown;
        ctx.fillRect(x, y - 3, wseg, 6);
        ctx.fillStyle = hi;
        ctx.fillRect(x, y - 3, wseg, 2);
        x += wseg + 1;
      }
    };

    const drawChar = (
      img: HTMLImageElement | null,
      cx: number,
      baseY: number,
      size: number,
      sabot: boolean,
      boost: boolean
    ) => {
      ctx.save();
      if (boost) {
        ctx.shadowColor = "rgba(250, 204, 21, 0.55)";
        ctx.shadowBlur = 16;
      }
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, cx - size / 2, baseY - size, size, size);
      } else {
        ctx.fillStyle = "#374151";
        ctx.fillRect(cx - size / 2, baseY - size, size, size * 0.85);
      }
      if (sabot) {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(cx - size / 2, baseY - size, size, size);
      }
      ctx.restore();
    };

    const drawMiniSpectator = (
      lx: number,
      ly: number,
      cw: number,
      ch: number,
      side: "red" | "blue",
      seed: number,
      animT: number
    ) => {
      const phase = animT * 0.0021 + seed * 0.027;
      const ox = Math.sin(phase) * Math.min(cw, ch) * 0.1;
      const oy = Math.cos(phase * 0.88) * Math.min(cw, ch) * 0.07;
      const x = lx + ox;
      const y = ly + oy;
      const hue = (seed % 13) / 13;
      if (cw < 3.5 || ch < 3.5) {
        ctx.fillStyle =
          side === "red"
            ? `rgba(${200 + hue * 50},${50 + hue * 40},${60 + hue * 35},0.88)`
            : `rgba(${45 + hue * 40},${110 + hue * 50},${220 + hue * 35},0.88)`;
        ctx.fillRect(x, y, cw, ch);
        return;
      }
      const headH = ch * 0.34;
      const bodyTop = y + headH * 0.75;
      const bodyH = ch - (bodyTop - y);
      ctx.fillStyle =
        side === "red"
          ? `rgba(${210 + hue * 45},${50 + hue * 35},${58 + hue * 32},0.92)`
          : `rgba(${48 + hue * 38},${118 + hue * 45},${222 + hue * 33},0.92)`;
      ctx.fillRect(x + cw * 0.12, y, cw * 0.76, headH);
      ctx.fillRect(x + cw * 0.22, bodyTop, cw * 0.56, bodyH);
      const armW = cw * 0.2;
      const armH = Math.max(1, ch * 0.14);
      ctx.fillRect(x, bodyTop + bodyH * 0.1, armW, armH);
      ctx.fillRect(x + cw - armW, bodyTop + bodyH * 0.1, armW, armH);
    };

    const drawCrowdStand = (
      x0: number,
      y0: number,
      bw: number,
      bh: number,
      n: number,
      side: "red" | "blue",
      animT: number
    ) => {
      if (n < 10 || bw < 8 || bh < 8) return;
      const cellW = bw / n;
      const cellH = bh / n;
      const gap = Math.max(0.2, Math.min(cellW, cellH) * 0.1);
      for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
          const seed = row * 157 + col * 97 + (side === "red" ? 3 : 71);
          const px = x0 + col * cellW + gap / 2;
          const py = y0 + row * cellH + gap / 2;
          const pw = Math.max(0.5, cellW - gap);
          const ph = Math.max(0.5, cellH - gap);
          drawMiniSpectator(px, py, pw, ph, side, seed, animT);
        }
      }
    };

    const drawFrame = () => {
      const s = drawRef.current;
      knotSmooth.current += (s.knotTargetPct - knotSmooth.current) * 0.18;

      const w = width;
      const h = height;
      const barH = 7;
      const groundY = h * 0.78;
      const ropeY = groundY - 28;

      const margin = w * 0.12;
      const leftCX = margin + w * 0.06;
      const rightCX = w - margin - w * 0.06;
      const charSize = Math.min(100, w * 0.22);
      const ropeA = leftCX + charSize * 0.38;
      const ropeB = rightCX - charSize * 0.38;
      /** Knot slides along the rope only (0–100% = red end → blue end). */
      const knotX = ropeA + (knotSmooth.current / 100) * (ropeB - ropeA);
      /** Lean characters toward center as the rope moves (–1 … +1). */
      const tug = (knotSmooth.current - 50) / 50;
      const lean = Math.max(-1, Math.min(1, tug)) * Math.min(14, w * 0.028);
      const leftDraw = leftCX + lean;
      const rightDraw = rightCX - lean;

      drawSky(w, h);
      drawSun(w, groundY - 20);
      drawForest(w, h, groundY);

      if (s.isActive) {
        const n = Math.max(10, Math.min(50, Math.floor(Number(s.crowdPerSide) || 10)));
        const animT = animTimeRef.current;
        const standTop = barH + 10;
        const standH = Math.max(36, groundY - standTop - 58);
        const leftStandW = Math.max(16, leftCX - charSize * 0.52 - 8);
        const rightStandX = rightCX + charSize * 0.52 + 6;
        const rightStandW = Math.max(16, w - rightStandX - 6);
        drawCrowdStand(4, standTop, leftStandW, standH, n, "red", animT);
        drawCrowdStand(rightStandX, standTop, rightStandW, standH, n, "blue", animT);
      }

      drawTopBar(w, knotX);

      drawChar(imgRed.current, leftDraw, groundY - 4, charSize, s.redSabotaged, s.redBoostActive);
      drawChar(imgBlue.current, rightDraw, groundY - 4, charSize, s.blueSabotaged, s.blueBoostActive);

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = `700 ${Math.max(11, w * 0.028)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("RED", leftDraw, groundY + 10);
      ctx.fillText("BLUE", rightDraw, groundY + 10);

      drawSegmentedRope(ropeA, knotX - 6, ropeY);
      drawSegmentedRope(knotX + 6, ropeB, ropeY);

      ctx.fillStyle = "#facc15";
      ctx.fillRect(knotX - 4, ropeY - 18, 8, 36);
      ctx.strokeStyle = "#ca8a04";
      ctx.lineWidth = 1;
      ctx.strokeRect(knotX - 4, ropeY - 18, 8, 36);

      if (s.isActive) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(0, barH, w, h - barH);
      }

      ctx.fillStyle = "rgba(15,10,20,0.75)";
      ctx.fillRect(margin * 0.3, h - 28, w - margin * 0.6, 22);
      ctx.strokeStyle = "rgba(250,204,21,0.35)";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(margin * 0.3 + 0.5, h - 27.5, w - margin * 0.6 - 1, 21);
      ctx.setLineDash([]);
      ctx.font = `600 ${Math.max(10, w * 0.024)}px ui-monospace, monospace`;
      ctx.fillStyle = "#e9e6f7";
      ctx.textAlign = "center";
      const status =
        !s.isActive && s.scoresSource === "chain"
          ? "Chain sync · idle — spawn for a preview session"
          : !s.isActive
            ? "Spawn to start · demo rope available"
            : s.scoresSource === "chain" && !s.onChainMatchPlaying
              ? "No match on-chain · R 0 B 0 — go to /play to pull"
              : s.scoresSource === "chain"
                ? `Live match · R ${s.redScore} · B ${s.blueScore}`
                : `Demo rope · R ${s.redScore} · B ${s.blueScore}`;
      ctx.fillText(status, w / 2, h - 13);

      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `600 ${Math.max(9, w * 0.02)}px ui-monospace, monospace`;
      ctx.fillText(`${s.redScore}`, 8, 20 + barH);
      ctx.textAlign = "right";
      ctx.fillText(`${s.blueScore}`, w - 8, 20 + barH);
    };

    const loop = (t: number) => {
      if (!visibleRef.current) {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null;
          rafRef.current = requestAnimationFrame(loop);
        }, 450);
        return;
      }
      const s = drawRef.current;
      const moving = s.isActive || Math.abs(knotSmooth.current - s.knotTargetPct) > 0.08;
      const minGap = moving ? 1000 / 40 : 1000 / 10;
      if (t - lastFrameAt.current < minGap) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrameAt.current = t;
      animTimeRef.current = t;
      drawFrame();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-[280px] w-full max-h-[480px] overflow-hidden rounded-sm md:min-h-[360px]"
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden />
    </div>
  );
}
