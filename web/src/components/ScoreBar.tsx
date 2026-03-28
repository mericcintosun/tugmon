'use client';

import React from 'react';

interface ScoreBarProps {
  redScore:  number;
  blueScore: number;
  redSabotaged?:  boolean;
  blueSabotaged?: boolean;
}

const ScoreBar: React.FC<ScoreBarProps> = ({
  redScore,
  blueScore,
  redSabotaged  = false,
  blueSabotaged = false,
}) => {
  const total  = redScore + blueScore || 1;
  const redPct = Math.round((redScore / total) * 100);
  const bluePct = 100 - redPct;

  return (
    <div className="w-full space-y-1">
      {/* Bar */}
      <div className="relative w-full h-12 rounded-full overflow-hidden bg-gray-900 border-4 border-white/5 shadow-2xl">
        {/* Red side */}
        <div
          className={`absolute left-0 top-0 h-full transition-all duration-500 ease-out flex items-center px-4
            ${redSabotaged
              ? 'bg-gradient-to-r from-gray-600 to-gray-700 animate-pulse'
              : 'bg-gradient-to-r from-red-700 to-orange-500'
            }`}
          style={{ width: `${redPct}%` }}
        >
          {redPct > 15 && (
            <span className="text-white font-black text-sm">{redScore}</span>
          )}
        </div>

        {/* Blue side */}
        <div
          className={`absolute right-0 top-0 h-full transition-all duration-500 ease-out flex items-center justify-end px-4
            ${blueSabotaged
              ? 'bg-gradient-to-l from-gray-600 to-gray-700 animate-pulse'
              : 'bg-gradient-to-l from-blue-700 to-indigo-500'
            }`}
          style={{ width: `${bluePct}%` }}
        >
          {bluePct > 15 && (
            <span className="text-white font-black text-sm">{blueScore}</span>
          )}
        </div>

        {/* Center divider */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-1 bg-white/20 z-10" />
      </div>

      {/* Percentage labels */}
      <div className="flex justify-between text-xs font-black text-gray-500 px-1">
        <span className="text-red-500/70">{redPct}%</span>
        <span className="text-blue-500/70">{bluePct}%</span>
      </div>
    </div>
  );
};

export default ScoreBar;
