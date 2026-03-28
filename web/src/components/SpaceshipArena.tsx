'use client';

import React from 'react';

interface SpaceshipArenaProps {
  redScore:       number;
  blueScore:      number;
  redBoosted:     boolean;
  blueBoosted:    boolean;
  redSabotaged:   boolean;
  blueSabotaged:  boolean;
  large?: boolean; // dashboard vs player view
}

const SpaceshipArena: React.FC<SpaceshipArenaProps> = ({
  redScore, blueScore,
  redBoosted, blueBoosted,
  redSabotaged, blueSabotaged,
  large = false,
}) => {
  const total   = redScore + blueScore || 1;
  const redPct  = (redScore / total) * 100;

  // Tug knot position: 50 = center, <50 = blue winning, >50 = red winning
  const knotPct = redPct; // 0–100%


  return (
    <div className="w-full select-none">
      {/* ── Main arena ── */}
      <div className="relative w-full flex items-center" style={{ height: large ? 120 : 80 }}>

        {/* Red Ship — left side, faces right */}
        <div
          className={`relative z-10 flex items-center justify-start ${large ? 'w-28' : 'w-16'}`}
          style={{ filter: redSabotaged ? 'grayscale(0.8) brightness(0.6)' : 'none' }}
        >
          <div
            className={`${large ? 'text-7xl' : 'text-4xl'} transition-transform duration-300`}
            style={{
              filter: redBoosted
                ? 'drop-shadow(0 0 12px #f97316) drop-shadow(0 0 24px #ef4444)'
                : 'drop-shadow(0 0 6px #ef444460)',
              transform: redSabotaged ? 'none' : undefined,
              animation: redSabotaged ? 'glitch 0.3s infinite' : redBoosted ? 'thruster 0.4s ease-in-out infinite' : 'none',
            }}
          >
            🚀
          </div>
          {/* Boost flames */}
          {redBoosted && (
            <div className="absolute -left-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <div className="flex flex-col gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full bg-gradient-to-l from-orange-400 to-transparent opacity-80"
                    style={{
                      width:  `${20 + Math.sin(i) * 10}px`,
                      height: '4px',
                      animationDelay: `${i * 60}ms`,
                      animation: 'flameFlicker 0.15s ease-in-out infinite alternate',
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {redSabotaged && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className={`${large ? 'text-3xl' : 'text-xl'} animate-bounce`}>❄️</span>
            </div>
          )}
        </div>

        {/* Tug rope */}
        <div className="flex-1 relative h-3 mx-1 rounded-full overflow-hidden bg-gray-900 border border-white/10">
          {/* Red section */}
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-700 to-red-500 transition-all duration-500 ease-out"
            style={{
              width: `${knotPct}%`,
              boxShadow: redBoosted ? '0 0 8px #ef4444, 0 0 16px #f97316' : undefined,
            }}
          />
          {/* Blue section */}
          <div
            className="absolute right-0 top-0 h-full bg-gradient-to-l from-blue-700 to-blue-500 transition-all duration-500 ease-out"
            style={{
              width: `${100 - knotPct}%`,
              boxShadow: blueBoosted ? '0 0 8px #3b82f6, 0 0 16px #6366f1' : undefined,
            }}
          />
          {/* Knot / center marker */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-gray-400 shadow-lg z-10 transition-all duration-500"
            style={{ left: `${knotPct}%` }}
          />
          {/* Sabotage crackle overlay */}
          {(redSabotaged || blueSabotaged) && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: redSabotaged
                  ? 'linear-gradient(90deg, rgba(147,197,253,0.3) 0%, transparent 40%)'
                  : 'linear-gradient(270deg, rgba(147,197,253,0.3) 0%, transparent 40%)',
                animation: 'sabCrackle 0.2s steps(2) infinite',
              }}
            />
          )}
        </div>

        {/* Blue Ship — right side, faces left (mirrored) */}
        <div
          className={`relative z-10 flex items-center justify-end ${large ? 'w-28' : 'w-16'}`}
          style={{ filter: blueSabotaged ? 'grayscale(0.8) brightness(0.6)' : 'none' }}
        >
          {blueBoosted && (
            <div className="absolute -right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <div className="flex flex-col gap-0.5 items-end">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full bg-gradient-to-r from-blue-400 to-transparent opacity-80"
                    style={{
                      width:  `${20 + Math.sin(i) * 10}px`,
                      height: '4px',
                      animation: 'flameFlicker 0.15s ease-in-out infinite alternate',
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div
            className={`${large ? 'text-7xl' : 'text-4xl'} transition-transform duration-300`}
            style={{
              transform: 'scaleX(-1)',
              filter: blueBoosted
                ? 'drop-shadow(0 0 12px #3b82f6) drop-shadow(0 0 24px #6366f1)'
                : 'drop-shadow(0 0 6px #3b82f660)',
              animation: blueSabotaged ? 'glitch 0.3s infinite' : blueBoosted ? 'thruster 0.4s ease-in-out infinite' : 'none',
            }}
          >
            🚀
          </div>
          {blueSabotaged && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className={`${large ? 'text-3xl' : 'text-xl'} animate-bounce`}>❄️</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Score labels ── */}
      <div className="flex justify-between px-1 mt-1 text-xs font-black">
        <span className={`${large ? 'text-lg' : 'text-xs'} ${redSabotaged ? 'text-blue-300 animate-pulse' : 'text-red-400'}`}>
          {redSabotaged ? '❄️ FROZEN' : `🔴 ${redScore}`}
        </span>
        <span className={`${large ? 'text-lg' : 'text-xs'} ${blueSabotaged ? 'text-red-300 animate-pulse' : 'text-blue-400'}`}>
          {blueSabotaged ? 'FROZEN ❄️' : `${blueScore} 🔵`}
        </span>
      </div>

      {/* ── Keyframe styles (inline for App Router compat) ── */}
      <style>{`
        @keyframes flameFlicker {
          from { opacity: 0.6; transform: scaleX(0.85); }
          to   { opacity: 1;   transform: scaleX(1.1); }
        }
        @keyframes thruster {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-2px); }
        }
        @keyframes glitch {
          0%   { transform: translate(0,0)    skew(0deg); opacity: 1; }
          20%  { transform: translate(-3px,0) skew(-3deg); opacity: 0.8; }
          40%  { transform: translate(3px,0)  skew(3deg); opacity: 1; }
          60%  { transform: translate(-2px,0) skew(1deg); opacity: 0.7; }
          80%  { transform: translate(2px,0)  skew(-1deg); opacity: 1; }
          100% { transform: translate(0,0)    skew(0deg); opacity: 1; }
        }
        @keyframes sabCrackle {
          0%   { opacity: 0.8; }
          100% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default SpaceshipArena;
