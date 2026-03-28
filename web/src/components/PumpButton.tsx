'use client';

import React, { useState, useCallback } from 'react';
import type { TeamId } from '@/utils/constants';

interface PumpButtonProps {
  team: TeamId;         // 0 = Red, 1 = Blue
  onPump: () => void;
  disabled?: boolean;
  isSabotaged?: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
}

const PumpButton: React.FC<PumpButtonProps> = ({ team, onPump, disabled, isSabotaged }) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  const isRed  = team === 1;
  const label  = isRed ? 'RED' : 'BLUE'; // team 1=Red 2=Blue
  const emoji  = isRed ? '🔴' : '🔵';

  const colorClasses = isRed
    ? 'bg-gradient-to-br from-red-500 to-orange-700 border-red-400 shadow-red-500/40 hover:shadow-red-500/60'
    : 'bg-gradient-to-br from-blue-500 to-indigo-700 border-blue-400 shadow-blue-500/40 hover:shadow-blue-500/60';

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isSabotaged) return;

    // Calculate click position relative to button
    const rect   = e.currentTarget.getBoundingClientRect();
    const x      = e.clientX - rect.left;
    const y      = e.clientY - rect.top;
    const id     = Date.now() + Math.random();
    const newP: Particle = { id, x, y };

    setParticles(prev => [...prev, newP]);
    setTimeout(() => setParticles(prev => prev.filter(p => p.id !== id)), 900);

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }

    onPump();
  }, [disabled, isSabotaged, onPump]);

  return (
    <div className="relative inline-block group">
      <button
        onClick={handleClick}
        disabled={disabled || isSabotaged}
        aria-label={`Pump for team ${label}`}
        className={[
          'w-40 h-40 rounded-full flex flex-col items-center justify-center',
          'text-white font-black uppercase select-none',
          'border-8 shadow-2xl transition-all duration-75',
          colorClasses,
          isSabotaged
            ? 'opacity-40 grayscale cursor-not-allowed'
            : disabled
              ? 'opacity-60 cursor-not-allowed'
              : 'cursor-pointer hover:shadow-2xl hover:-translate-y-1 active:scale-95 active:translate-y-0',
        ].join(' ')}
      >
        <span className="text-3xl leading-none">{emoji}</span>
        <span className="text-xl font-black mt-1">PUMP</span>
        <span className="text-[10px] opacity-60 tracking-widest">TEAM {label}</span>
        {isSabotaged && (
          <span className="text-[9px] text-red-300 animate-pulse mt-1">SABOTAGED!</span>
        )}
      </button>

      {/* Ripple particles */}
      {particles.map(p => (
        <span
          key={`ripple-${p.id}`}
          className={`absolute pointer-events-none rounded-full animate-ping ${isRed ? 'bg-red-400/60' : 'bg-blue-400/60'}`}
          style={{ left: p.x - 10, top: p.y - 10, width: 20, height: 20 }}
        />
      ))}

      {/* Float-up +1 labels */}
      {particles.map(p => (
        <span
          key={`label-${p.id}`}
          className={`absolute pointer-events-none font-black text-xl ${isRed ? 'text-red-300' : 'text-blue-300'}`}
          style={{
            left: p.x - 12,
            top:  p.y - 12,
            animation: 'floatUp 0.9s ease-out forwards',
          }}
        >
          +1
        </span>
      ))}
    </div>
  );
};

export default PumpButton;
