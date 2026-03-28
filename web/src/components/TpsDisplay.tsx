'use client';

import React, { useEffect, useRef, useState } from 'react';

interface TpsDisplayProps {
  eventCount: number;    // increment each time a new on-chain event fires
  compact?: boolean;     // mini version for mobile score strip
}

const TpsDisplay: React.FC<TpsDisplayProps> = ({ eventCount, compact = false }) => {
  const [tps,         setTps]         = useState(0);
  const [displayTps,  setDisplayTps]  = useState(0);
  const [history,     setHistory]     = useState<number[]>([]);
  const countRef  = useRef(0);
  const prevCount = useRef(eventCount);
  const tickKey   = useRef(0);

  // Accumulate between ticks
  useEffect(() => {
    const delta = eventCount - prevCount.current;
    if (delta > 0) countRef.current += delta;
    prevCount.current = eventCount;
  }, [eventCount]);

  // 1-second tick → EMA TPS
  useEffect(() => {
    const id = setInterval(() => {
      const raw = countRef.current;
      countRef.current = 0;
      setTps(prev => {
        const next = prev * 0.5 + raw * 0.5;
        setHistory(h => [...h.slice(-14), next]);
        return next;
      });
      tickKey.current += 1;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Smooth display interpolation
  useEffect(() => {
    const id = setInterval(() => {
      setDisplayTps(prev => {
        const diff = tps - prev;
        if (Math.abs(diff) < 0.05) return tps;
        return prev + diff * 0.3;
      });
    }, 100);
    return () => clearInterval(id);
  }, [tps]);

  const formatted = Math.round(displayTps).toLocaleString();
  const barWidth  = Math.min((displayTps / 30) * 100, 100); // 30 TPS = full bar

  if (compact) {
    return (
      <div className="flex items-baseline gap-1">
        <span className="font-orbitron text-lg font-black text-indigo-400">{formatted}</span>
        <span className="text-[9px] font-bold text-indigo-600 uppercase">TPS</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">MONAD AĞ HIZI</div>
      <div className="flex items-baseline gap-2">
        <span
          className="font-orbitron font-black text-white tabular-nums"
          style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', textShadow: '0 0 30px rgba(99,102,241,0.6)' }}
        >
          {formatted}
        </span>
        <span className="font-orbitron font-bold text-indigo-400 text-2xl animate-pulse">TPS</span>
      </div>

      {/* Mini bar chart — last 15 seconds */}
      <div className="flex items-end gap-0.5 h-5">
        {history.map((v, i) => (
          <div
            key={i}
            className="w-2.5 rounded-sm bg-indigo-500/60 transition-all duration-300"
            style={{ height: `${Math.max(3, (v / Math.max(...history, 1)) * 100)}%` }}
          />
        ))}
      </div>

      {/* Linear bar */}
      <div className="w-48 h-1 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${barWidth}%`, boxShadow: '0 0 8px rgba(99,102,241,0.8)' }}
        />
      </div>
    </div>
  );
};

export default TpsDisplay;
