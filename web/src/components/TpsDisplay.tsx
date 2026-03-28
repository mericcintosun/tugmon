'use client';

import React, { useEffect, useRef, useState } from 'react';

interface TpsDisplayProps {
  /** Increment each time the dashboard processes a new on-chain event (not global chain TPS). */
  eventCount: number;
  compact?: boolean;
  /** When compact, omit trailing "TPS" if the parent already shows a label */
  hideUnit?: boolean;
  /** Latest block tx count from RPC (full txs in block body when supported). */
  chainBlockTxCount?: number | null;
  /** Block time Δ vs parent (seconds), for snapshot rate. */
  chainBlockDeltaSec?: number | null;
}

const TpsDisplay: React.FC<TpsDisplayProps> = ({
  eventCount,
  compact = false,
  hideUnit = false,
  chainBlockTxCount,
  chainBlockDeltaSec,
}) => {
  const [tps,         setTps]         = useState(0);
  const [displayTps,  setDisplayTps]  = useState(0);
  const [history,     setHistory]     = useState<number[]>([]);
  const countRef  = useRef(0);
  const prevCount = useRef(eventCount);

  useEffect(() => {
    const delta = eventCount - prevCount.current;
    if (delta > 0) countRef.current += delta;
    prevCount.current = eventCount;
  }, [eventCount]);

  useEffect(() => {
    const id = setInterval(() => {
      const raw = countRef.current;
      countRef.current = 0;
      setTps(prev => {
        const next = prev * 0.5 + raw * 0.5;
        setHistory(h => [...h.slice(-14), next]);
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

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
  const barWidth  = Math.min((displayTps / 30) * 100, 100);
  const maxHist   = history.length ? Math.max(...history, 0.01) : 1;

  const chainSnapshotRate =
    chainBlockTxCount != null &&
    chainBlockDeltaSec != null &&
    chainBlockDeltaSec > 0
      ? chainBlockTxCount / chainBlockDeltaSec
      : null;

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-baseline justify-center gap-1">
          <span
            className="font-orbitron text-lg font-black tabular-nums text-indigo-300 sm:text-xl"
            style={{ textShadow: '0 0 18px rgba(129, 140, 248, 0.55)' }}
          >
            {formatted}
          </span>
          {!hideUnit && (
            <span className="text-[9px] font-bold uppercase text-indigo-500/90">evt/s</span>
          )}
        </div>
        <span className="text-[8px] font-medium uppercase tracking-wider text-white/35">
          est. activity
        </span>
      </div>
    );
  }

  return (
    <div className="flex max-w-[min(100%,22rem)] flex-col items-end gap-1">
      <div className="text-right text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400/90">
        Estimated activity (events/s)
      </div>
      <div className="text-[9px] text-right leading-snug text-gray-500">
        Derived from contract events processed in this session — not network-wide Monad TPS.
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="font-orbitron font-black text-white tabular-nums"
          style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', textShadow: '0 0 30px rgba(99,102,241,0.6)' }}
        >
          {formatted}
        </span>
        <span className="font-orbitron font-bold text-indigo-400 text-2xl animate-pulse">evt/s</span>
      </div>

      {chainBlockTxCount != null && chainBlockDeltaSec != null && (
        <div className="mt-1 max-w-sm text-right text-[10px] leading-relaxed text-gray-400">
          <span className="font-semibold text-gray-300">Chain snapshot: </span>
          last block <span className="font-mono text-indigo-200/90">{chainBlockTxCount}</span> txs
          {chainSnapshotRate != null && (
            <>
              {' '}
              (~{chainSnapshotRate.toFixed(1)} txs/s over {chainBlockDeltaSec}s block interval)
            </>
          )}
        </div>
      )}

      <div className="flex h-5 items-end gap-0.5">
        {history.map((v, i) => (
          <div
            key={i}
            className="w-2.5 rounded-sm bg-indigo-500/60 transition-all duration-300"
            style={{ height: `${Math.max(3, (v / maxHist) * 100)}%` }}
          />
        ))}
      </div>

      <div className="h-1 w-48 overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${barWidth}%`, boxShadow: '0 0 8px rgba(99,102,241,0.8)' }}
        />
      </div>
    </div>
  );
};

export default TpsDisplay;
