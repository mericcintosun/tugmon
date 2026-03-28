'use client';

import React, { useState } from 'react';
import type { TeamId } from '@/utils/constants';

interface ActionButtonProps {
  type: 'boost' | 'sabotage';
  /** For sabotage: which team to target. For boost: which team to boost. */
  team: TeamId;
  onAction: () => void;
  cooldownSeconds?: number;
  disabled?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  type,
  team,
  onAction,
  cooldownSeconds = 30,
  disabled = false,
}) => {
  const [countdown, setCountdown] = useState(0);

  const isBoost    = type === 'boost';
  const isRed      = team === 1;
  const isCooldown = countdown > 0 || disabled;

  const config = isBoost
    ? {
        emoji:  '⚡',
        label:  'BOOST',
        sublabel: `2x for 5s`,
        active: 'bg-yellow-500/20 border-yellow-400/60 text-yellow-300 hover:bg-yellow-500/30',
        glow:   'shadow-yellow-500/20',
      }
    : {
        emoji:  '💣',
        label:  'SABOTAGE',
        sublabel: isRed ? 'FREEZE RED' : 'FREEZE BLUE',
        active: 'bg-red-800/20 border-red-500/60 text-red-300 hover:bg-red-800/40',
        glow:   'shadow-red-500/20',
      };

  const handleClick = () => {
    if (isCooldown) return;
    onAction();

    // Haptic
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([40, 20, 40]);
    }

    // Local countdown UI
    setCountdown(cooldownSeconds);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <button
      onClick={handleClick}
      disabled={isCooldown}
      aria-label={`${config.label} team ${team === 1 ? 'Red' : 'Blue'}`}
      className={[
        'px-5 py-3 rounded-2xl border-2 font-black text-sm uppercase tracking-wider',
        'transition-all duration-150 shadow-lg select-none',
        isCooldown
          ? 'opacity-40 cursor-not-allowed bg-gray-800 border-gray-600 text-gray-500'
          : `${config.active} ${config.glow} cursor-pointer hover:scale-105 active:scale-95`,
      ].join(' ')}
    >
      <span className="text-lg">{config.emoji}</span>
      <span className="ml-2">{config.label}</span>
      <span className="block text-[9px] opacity-60 tracking-widest font-normal">
        {countdown > 0 ? `COOLDOWN ${countdown}s` : config.sublabel}
      </span>
    </button>
  );
};

export default ActionButton;
