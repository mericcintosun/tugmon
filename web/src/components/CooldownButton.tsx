'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface CooldownButtonProps {
  label:        string;
  subLabel:     string;
  emoji:        string;
  colorClass:   string;           // e.g. 'text-yellow-300 border-yellow-400/50'
  onAction:     () => void;
  cooldownSecs?: number;
  disabled?:    boolean;
}

const CooldownButton: React.FC<CooldownButtonProps> = ({
  label, subLabel, emoji, colorClass, onAction, cooldownSecs = 30, disabled = false,
}) => {
  const [remaining, setRemaining] = useState(0);

  const R      = 44; // SVG circle radius
  const circ   = 2 * Math.PI * R;
  const progress = remaining > 0 ? remaining / cooldownSecs : 0;
  const dash     = circ * progress;

  const isCd = remaining > 0 || disabled;

  const handleClick = useCallback(() => {
    if (isCd) return;
    onAction();
    setRemaining(cooldownSecs);
  }, [isCd, cooldownSecs, onAction]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  return (
    <button
      onClick={handleClick}
      disabled={isCd}
      className={[
        'relative w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 font-bold',
        'transition-all duration-150 select-none overflow-hidden',
        isCd
          ? 'bg-gray-900/80 border-gray-700 text-gray-500 cursor-not-allowed'
          : `bg-black/40 ${colorClass} cursor-pointer hover:scale-[1.02] active:scale-95 hover:bg-white/5`,
      ].join(' ')}
    >
      {/* SVG circular progress overlay */}
      {remaining > 0 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100% 100%"
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
        >
          {/* We use a separate fixed-size SVG approach below */}
        </svg>
      )}

      {/* Circular countdown badge */}
      <div className="relative flex-shrink-0 w-14 h-14">
        {remaining > 0 ? (
          <>
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={R} stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="none" />
              <circle
                cx="50" cy="50" r={R}
                stroke="currentColor" strokeWidth="6" fill="none"
                strokeDasharray={`${circ} ${circ}`}
                strokeDashoffset={`${circ - dash}`}
                strokeLinecap="round"
                className="cooldown-circle"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums">
              {remaining}
            </div>
          </>
        ) : (
          <div className="w-full h-full rounded-full bg-white/5 border border-current/30 flex items-center justify-center text-2xl">
            {emoji}
          </div>
        )}
      </div>

      {/* Text */}
      <div className="flex flex-col items-start">
        <span className="text-sm font-black uppercase tracking-wider">{isCd && remaining > 0 ? 'COOLDOWN' : label}</span>
        <span className="text-xs opacity-60">{subLabel}</span>
      </div>

      {/* Glow fill when ready */}
      {!isCd && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-10 bg-white" />
      )}
    </button>
  );
};

export default CooldownButton;
