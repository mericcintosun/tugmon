"use client";

import React, { useEffect, useRef, useState } from "react";

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
  /** Full layout only: align block to start (e.g. inside glass panels). */
  align?: "start" | "end";
}

const TpsDisplay: React.FC<TpsDisplayProps> = ({
  eventCount,
  compact = false,
  hideUnit = false,
  chainBlockTxCount,
  chainBlockDeltaSec,
  align = "end",
}) => {
  const [tps, setTps] = useState(0);
  const [displayTps, setDisplayTps] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const countRef = useRef(0);
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
      setTps((prev) => {
        const next = prev * 0.5 + raw * 0.5;
        setHistory((h) => [...h.slice(-14), next]);
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setDisplayTps((prev) => {
        const diff = tps - prev;
        if (Math.abs(diff) < 0.05) return tps;
        return prev + diff * 0.3;
      });
    }, 100);
    return () => clearInterval(id);
  }, [tps]);

  const formatted = Math.round(displayTps).toLocaleString();
  const barWidth = Math.min((displayTps / 30) * 100, 100);
  const maxHist = history.length ? Math.max(...history, 0.01) : 1;

  const chainSnapshotRate =
    chainBlockTxCount != null && chainBlockDeltaSec != null && chainBlockDeltaSec > 0
      ? chainBlockTxCount / chainBlockDeltaSec
      : null;

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-baseline justify-center gap-1">
          <span
            className="font-label text-lg font-black tabular-nums text-tertiary sm:text-xl"
            style={{ textShadow: "0 0 18px rgba(161, 250, 255, 0.45)" }}
          >
            {formatted}
          </span>
          {!hideUnit && (
            <span className="font-label text-[9px] font-bold uppercase text-primary/90">evt/s</span>
          )}
        </div>
        <span className="text-[8px] font-medium uppercase tracking-wider text-on-surface-variant">
          est. activity
        </span>
      </div>
    );
  }

  const isStart = align === "start";

  return (
    <div
      className={`flex w-full flex-col gap-1 ${isStart ? "max-w-none items-start" : "max-w-[min(100%,22rem)] items-end"}`}
    >
      <div
        className={`font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary/90 ${isStart ? "text-left" : "text-right"}`}
      >
        Estimated activity (events/s)
      </div>
      <div className={`text-[9px] leading-snug text-outline ${isStart ? "text-left" : "text-right"}`}>
        Derived from contract events processed in this session — not network-wide Monad TPS.
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="font-label font-black tabular-nums text-on-surface"
          style={{ fontSize: "clamp(2.5rem, 5vw, 4.5rem)", textShadow: "0 0 30px rgba(175, 162, 255, 0.45)" }}
        >
          {formatted}
        </span>
        <span className="font-label text-2xl font-bold animate-pulse text-primary">evt/s</span>
      </div>

      {chainBlockTxCount != null && chainBlockDeltaSec != null && (
        <div
          className={`mt-1 max-w-sm font-body text-[10px] leading-relaxed text-on-surface-variant ${isStart ? "text-left" : "text-right"}`}
        >
          <span className="font-semibold text-on-surface">Chain snapshot: </span>
          last block <span className="font-mono text-tertiary">{chainBlockTxCount}</span> txs
          {chainSnapshotRate != null && (
            <>
              {" "}
              (~{chainSnapshotRate.toFixed(1)} txs/s over {chainBlockDeltaSec}s block interval)
            </>
          )}
        </div>
      )}

      <div className={`flex h-5 items-end gap-0.5 ${isStart ? "self-stretch justify-start" : ""}`}>
        {history.map((v, i) => (
          <div
            key={i}
            className="w-2.5 rounded-sm bg-primary/60 transition-all duration-300"
            style={{ height: `${Math.max(3, (v / maxHist) * 100)}%` }}
          />
        ))}
      </div>

      <div className={`h-1 overflow-hidden rounded-full bg-outline-variant/50 ${isStart ? "w-full max-w-xs" : "w-48"}`}>
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${barWidth}%`, boxShadow: "0 0 8px rgba(175, 162, 255, 0.6)" }}
        />
      </div>
    </div>
  );
};

export default TpsDisplay;
