"use client";

import React, { useRef, useEffect, useCallback } from "react";

export interface CanvasTugOfWarProps {
  role?: "Engineer" | "Booster" | "Saboteur" | "None";
  team?: "Red" | "Blue";
  onPull?: () => void;
  serverRopePosition?: number;
}

export const CanvasTugOfWar: React.FC<CanvasTugOfWarProps> = ({
  role = "Engineer",
  team = "Red",
  onPull,
  serverRopePosition = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentDrawPos = useRef(0);
  const targetPos = useRef(serverRopePosition);

  useEffect(() => {
    targetPos.current = serverRopePosition;
  }, [serverRopePosition]);

  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener("touchmove", preventDefault, { passive: false });
    return () => document.removeEventListener("touchmove", preventDefault);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      width = rect.width;
      height = rect.height;

      canvas.width = width * dpr;
      canvas.height = height * dpr;

      ctx.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    window.addEventListener("resize", resize);
    resize();

    const draw = () => {
      currentDrawPos.current += (targetPos.current - currentDrawPos.current) * 0.15;

      ctx.clearRect(0, 0, width, height);

      const centerY = height / 2;
      const centerX = width / 2;

      ctx.fillStyle = "#1e3a8a";
      ctx.fillRect(0, 0, centerX + currentDrawPos.current, height);

      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(centerX + currentDrawPos.current, 0, width, height);

      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, height);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.setLineDash([10, 15]);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(-50, centerY);
      ctx.lineTo(width + 50, centerY);
      ctx.strokeStyle = "#d4d4d8";
      ctx.lineWidth = 8;
      ctx.stroke();

      const knotX = centerX + currentDrawPos.current;
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(knotX, centerY, 16, 0, Math.PI * 2);
      ctx.fillStyle = "#fbbf24";
      ctx.fill();
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(knotX - 100, centerY - 25, 40, 50);

      ctx.fillStyle = "#ef4444";
      ctx.fillRect(knotX + 60, centerY - 25, 40, 50);

      animationFrameId = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handlePull = useCallback(
    (e: React.PointerEvent) => {
      if (e.nativeEvent) {
        e.preventDefault();
      }

      const power = role === "Engineer" ? 10 : 5;
      const direction = team === "Red" ? 1 : -1;
      targetPos.current += power * direction;

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(30);
      }

      if (onPull) {
        onPull();
      }
    },
    [role, team, onPull]
  );

  return (
    <div
      ref={containerRef}
      className="flex h-full max-h-screen w-full touch-none select-none flex-col overflow-hidden overscroll-none bg-black"
    >
      <div className="relative h-2/3 w-full flex-shrink-0">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" />

        <div className="absolute left-6 top-4 text-2xl font-black text-white opacity-60 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
          BLUE
        </div>
        <div className="absolute right-6 top-4 text-2xl font-black text-white opacity-60 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
          RED
        </div>
      </div>

      <div className="flex h-1/3 w-full flex-grow flex-col items-center justify-center border-t border-gray-800 bg-gray-950 p-6">
        <button
          type="button"
          onPointerDown={handlePull}
          className={`
            flex h-full w-full max-w-sm select-none flex-col items-center justify-center rounded-2xl border-b-[8px] transition-all focus:outline-none
            active:translate-y-[8px] active:border-b-[0px]
            ${team === "Red"
              ? "border-red-900 bg-red-600 text-red-50 hover:bg-red-500 active:bg-red-700"
              : "border-blue-900 bg-blue-600 text-blue-50 hover:bg-blue-500 active:bg-blue-700"
            }
          `}
        >
          <span className="pointer-events-none text-5xl font-black uppercase tracking-wider drop-shadow-md">
            PULL!
          </span>
          <span className="pointer-events-none mt-2 font-bold tracking-wide opacity-80">
            Role: {role}
          </span>
        </button>
      </div>
    </div>
  );
};

export default CanvasTugOfWar;
