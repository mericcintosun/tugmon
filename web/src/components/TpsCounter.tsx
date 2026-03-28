'use client';

import React, { useState, useEffect, useRef } from 'react';

interface TpsCounterProps {
  /** Increment this number each time a new blockchain event arrives */
  eventCount: number;
}

const TpsCounter: React.FC<TpsCounterProps> = ({ eventCount }) => {
  const [tps, setTps] = useState(0);
  const countRef  = useRef(0);
  const prevCount = useRef(eventCount);

  // Accumulate events between ticks
  useEffect(() => {
    const delta = eventCount - prevCount.current;
    if (delta > 0) countRef.current += delta;
    prevCount.current = eventCount;
  }, [eventCount]);

  // Every second: calculate TPS with exponential smoothing
  useEffect(() => {
    const interval = setInterval(() => {
      const raw = countRef.current;
      countRef.current = 0;
      setTps(prev => prev * 0.4 + raw * 0.6); // EMA
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const displayTps = Math.round(tps * 10) / 10;
  const barWidth   = Math.min((tps / 20) * 100, 100); // max bar at 20 TPS

  return (
    <div className="flex flex-col items-center justify-center px-6 py-4 bg-black/60 border-2 border-indigo-500/50 rounded-2xl shadow-2xl shadow-indigo-500/20 backdrop-blur-md min-w-[180px]">
      <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">
        MONAD SPEED
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-6xl font-black text-white tabular-nums leading-none">
          {displayTps.toFixed(1)}
        </span>
        <span className="text-xl font-bold text-indigo-400 animate-pulse">TPS</span>
      </div>
      <div className="mt-3 w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 shadow-lg shadow-indigo-500/50 transition-all duration-300"
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
};

export default TpsCounter;
