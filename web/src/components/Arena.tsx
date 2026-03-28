"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ArenaCanvas from "@/components/ArenaCanvas";
import { CONTRACT_ADDRESS } from "@/utils/constants";
import {
  explorerAddressUrl,
  explorerBlockUrl,
  getChainIdDisplay,
} from "@/utils/explorer";

const POLL_MS = 750;
const DEMO_TICK_MS = 160;
/** Canvas-only crowd density when Spawn is on (not on-chain, does not affect TPS). */
const CROWD_GRID_MIN = 10;
const CROWD_GRID_MAX = 50;
const CROWD_PIXELS_MAX = CROWD_GRID_MAX * CROWD_GRID_MAX;
/** Pulls/s at or above this maps crowd grid to 50×50 (pullMany can burst high). */
const ARENA_PULL_RATE_CAP = 45;

/** Format RPC-derived network TPS (recent blocks). */
function formatChainTps(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1000) return Math.round(n).toLocaleString();
  return String(Math.round(n * 10) / 10);
}

type GameScoresPayload = {
  ok?: boolean;
  redScore?: number;
  blueScore?: number;
  redBoostEndTime?: number;
  blueBoostEndTime?: number;
  redSabotageEndTime?: number;
  blueSabotageEndTime?: number;
  blockNumber?: number | null;
  chainTps?: number | null;
  arenaPullTps?: number | null;
  error?: string;
};

/** 0 = knot at red side, 100 = at blue side (maps to rope span in canvas). */
function scoresToKnotPct(red: number, blue: number): number {
  const total = red + blue;
  if (total <= 0) return 50;
  return 100 * (1 - red / total);
}

function shortAddr(a: string): string {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Arena() {
  const [isActive, setIsActive] = useState(false);
  const [chainOk, setChainOk] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [pullRate, setPullRate] = useState(0);
  /** Smoothed instant rate (EMA) so UI is not stuck at 0 between polls. */
  const pullEmaRef = useRef(0);
  const [blockNumber, setBlockNumber] = useState<number | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);

  const [redScore, setRedScore] = useState(0);
  const [blueScore, setBlueScore] = useState(0);
  const [redBoostEnd, setRedBoostEnd] = useState(0);
  const [blueBoostEnd, setBlueBoostEnd] = useState(0);
  const [redSaboEnd, setRedSaboEnd] = useState(0);
  const [blueSaboEnd, setBlueSaboEnd] = useState(0);

  const [demoKnot, setDemoKnot] = useState(50);
  const [chainTps, setChainTps] = useState<number | null>(null);
  /** Wall clock for boost / sabotage windows (avoid Date.now() in render). */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const prevSample = useRef({ red: 0, blue: 0, t: 0 });
  /** Baseline total on-chain score when war started — for session-average pulls/s. */
  const [warBaseline, setWarBaseline] = useState<{ t: number; sum: number } | null>(null);
  const pendingWarBaseline = useRef(false);
  const isActiveRef = useRef(isActive);
  const [tabVisible, setTabVisible] = useState(true);
  const [crowdManual, setCrowdManual] = useState(10);
  const [arenaPullTps, setArenaPullTps] = useState<number | null>(null);

  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") setNowMs(Date.now());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const fetchScores = useCallback(async () => {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    try {
      const res = await fetch("/api/game-scores", { cache: "no-store" });
      const data = (await res.json()) as GameScoresPayload;
      const ms = typeof performance !== "undefined" ? performance.now() - t0 : 0;
      setLatencyMs(Math.round(ms * 100) / 100);

      const ok = Boolean(data.ok);
      setChainOk(ok);
      setRpcError(
        ok ? null : typeof data.error === "string" && data.error.length > 0 ? data.error : "RPC read failed"
      );
      const r = typeof data.redScore === "number" ? data.redScore : 0;
      const b = typeof data.blueScore === "number" ? data.blueScore : 0;
      setRedScore(r);
      setBlueScore(b);
      setRedBoostEnd(typeof data.redBoostEndTime === "number" ? data.redBoostEndTime : 0);
      setBlueBoostEnd(typeof data.blueBoostEndTime === "number" ? data.blueBoostEndTime : 0);
      setRedSaboEnd(typeof data.redSabotageEndTime === "number" ? data.redSabotageEndTime : 0);
      setBlueSaboEnd(typeof data.blueSabotageEndTime === "number" ? data.blueSabotageEndTime : 0);
      if (typeof data.blockNumber === "number") setBlockNumber(data.blockNumber);
      else if (data.blockNumber === null) setBlockNumber(null);
      if (typeof data.chainTps === "number" && Number.isFinite(data.chainTps)) {
        setChainTps(data.chainTps);
      } else {
        setChainTps(null);
      }
      if (typeof data.arenaPullTps === "number" && Number.isFinite(data.arenaPullTps)) {
        setArenaPullTps(data.arenaPullTps);
      } else {
        setArenaPullTps(null);
      }
      setNowMs(Date.now());

      const now = Date.now();
      const prev = prevSample.current;
      if (prev.t > 0 && ok) {
        const dt = (now - prev.t) / 1000;
        const dScore = Math.abs(r - prev.red) + Math.abs(b - prev.blue);
        if (dt > 0.05) {
          const instant = dScore / dt;
          pullEmaRef.current = pullEmaRef.current * 0.65 + instant * 0.35;
          setPullRate(Math.round(pullEmaRef.current * 10) / 10);
        }
      }
      prevSample.current = { red: r, blue: b, t: now };

      if (pendingWarBaseline.current && ok && isActiveRef.current) {
        setWarBaseline({ t: Date.now(), sum: r + b });
        pendingWarBaseline.current = false;
      }
    } catch {
      setChainOk(false);
      setLatencyMs(null);
      setChainTps(null);
      setArenaPullTps(null);
      setRpcError("Could not reach /api/game-scores");
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void fetchScores(), 0);
    return () => clearTimeout(t);
  }, [fetchScores]);

  useEffect(() => {
    const configured =
      Boolean(CONTRACT_ADDRESS) && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";
    let ms = 0;
    if (isActive) ms = POLL_MS;
    else if (configured) ms = 4000;
    if (ms === 0) return;
    const effectiveMs = tabVisible ? ms : Math.max(ms, 15000);
    const id = window.setInterval(() => void fetchScores(), effectiveMs);
    return () => clearInterval(id);
  }, [isActive, fetchScores, tabVisible]);

  const contractConfigured =
    CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

  const liveCrowdSide = useMemo(() => {
    if (!contractConfigured || arenaPullTps === null) return null;
    const t = Math.min(Math.max(arenaPullTps, 0), ARENA_PULL_RATE_CAP);
    return Math.round(CROWD_GRID_MIN + (t / ARENA_PULL_RATE_CAP) * (CROWD_GRID_MAX - CROWD_GRID_MIN));
  }, [contractConfigured, arenaPullTps]);

  const crowdPerSide = liveCrowdSide ?? crowdManual;

  /** True when contract read succeeded and combined score is non-zero (on-chain pulls happened). */
  const onChainMatchPlaying = chainOk && redScore + blueScore > 0;

  /** Animate rope when session is on but chain is down or no on-chain pulls yet (scores still 0). */
  const useDemoRopeMotion = isActive && (!chainOk || !onChainMatchPlaying);

  useEffect(() => {
    if (!useDemoRopeMotion) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setDemoKnot((prev) => {
        const move = (Math.random() - 0.5) * 5;
        const next = prev + move;
        return next > 92 ? 92 : next < 8 ? 8 : next;
      });
    }, DEMO_TICK_MS);
    return () => clearInterval(id);
  }, [useDemoRopeMotion]);

  const nowSec = nowMs / 1000;
  const knotTarget =
    isActive && chainOk && onChainMatchPlaying
      ? scoresToKnotPct(redScore, blueScore)
      : isActive
        ? demoKnot
        : chainOk
          ? scoresToKnotPct(redScore, blueScore)
          : demoKnot;

  /** Average pulls/s since Spawn (total on-chain score delta / elapsed). */
  const sessionPullsPerSec =
    isActive && warBaseline
      ? Math.max(
          0,
          (redScore + blueScore - warBaseline.sum) / Math.max(0.001, (nowMs - warBaseline.t) / 1000)
        )
      : 0;
  const chainActivityDisplay =
    isActive && chainOk && onChainMatchPlaying
      ? Math.round(Math.max(pullRate, sessionPullsPerSec) * 10) / 10
      : 0;
  const redBoostActive = redBoostEnd > nowSec;
  const blueBoostActive = blueBoostEnd > nowSec;
  const redSabotaged = redSaboEnd > nowSec;
  const blueSabotaged = blueSaboEnd > nowSec;

  const spawnPlayers = useCallback(() => {
    setIsActive((prev) => {
      const next = !prev;
      if (!prev && next) {
        setDemoKnot(50);
        prevSample.current = { red: redScore, blue: blueScore, t: 0 };
        pullEmaRef.current = 0;
        pendingWarBaseline.current = true;
        void fetchScores();
      }
      if (prev && !next) {
        queueMicrotask(() => {
          setWarBaseline(null);
          pendingWarBaseline.current = false;
          setPullRate(0);
          pullEmaRef.current = 0;
        });
      }
      return next;
    });
  }, [fetchScores, redScore, blueScore]);

  const stitchingLabel = !isActive
    ? "IDLE"
    : !chainOk
      ? "DEMO_SESSION"
      : onChainMatchPlaying
        ? "MATCH_LIVE"
        : "SIM_PREVIEW";

  const sessionBannerText =
    !isActive
      ? "Waiting…"
      : !chainOk
        ? "Session · offline demo"
        : onChainMatchPlaying
          ? "Match live · chain scores"
          : "Simulated tug · /play for on-chain pulls";

  return (
    <section className="w-full" aria-label="Arena tug-of-war">
      <div className="relative overflow-hidden rounded-sm bg-surface-container p-6 sm:p-10 md:p-12 stitched-border">
        <div className="mb-8 flex flex-col items-start justify-between gap-6 md:mb-10 md:flex-row md:items-end">
          <div>
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.28em] text-outline">Demo · pitch</p>
            <h2 className="mt-1 font-headline text-2xl font-bold uppercase tracking-tight text-on-surface sm:text-3xl">
              Real-time arena
            </h2>
            <p className="mt-2 font-label text-xs text-on-surface-variant sm:text-sm">
              LATENCY:{" "}
              <span className={isActive ? "text-tertiary" : "text-outline"}>
                {latencyMs != null ? `${latencyMs}ms` : "—"}
              </span>
              <span className="mx-2 text-outline/60">|</span>
              STITCHING:{" "}
              <span
                className={
                  isActive ? (onChainMatchPlaying ? "text-secondary" : "text-tertiary") : "text-outline"
                }
                title={isActive && chainOk && !onChainMatchPlaying ? "Rope motion is a preview until scores move on-chain" : undefined}
              >
                {stitchingLabel}
              </span>
              {blockNumber != null && (
                <>
                  <span className="mx-2 text-outline/60">|</span>
                  <span className="text-outline">BLOCK</span>{" "}
                  <span className="text-on-surface-variant">{blockNumber}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-col gap-1 sm:w-[min(100%,14rem)]">
              {liveCrowdSide != null ? (
                <div className="font-label text-[10px] uppercase tracking-widest text-outline">
                  Live crowd (chain){" "}
                  <span className="tabular-nums text-on-surface-variant">
                    {crowdPerSide}×{crowdPerSide}
                  </span>
                  <span className="mt-0.5 block font-body normal-case tracking-normal text-[9px] text-outline/75">
                    <span className="tabular-nums text-on-surface-variant">
                      {crowdPerSide * crowdPerSide}
                    </span>{" "}
                    sprites · from <span className="text-tertiary">Pulled</span> log rate on TugmonArena
                  </span>
                  <span className="block font-body normal-case tracking-normal text-[9px] text-outline/75">
                    More on-chain pulls → denser grid (same RPC window as pull speed)
                  </span>
                </div>
              ) : (
                <>
                  <label
                    htmlFor="arena-crowd-grid"
                    className="font-label text-[10px] uppercase tracking-widest text-outline"
                  >
                    Crowd density (demo){" "}
                    <span className="tabular-nums text-on-surface-variant">
                      {crowdPerSide}×{crowdPerSide}
                    </span>
                    <span className="mt-0.5 block font-body normal-case tracking-normal text-[9px] text-outline/75">
                      <span className="tabular-nums text-on-surface-variant">
                        {crowdPerSide * crowdPerSide}
                      </span>{" "}
                      / {CROWD_PIXELS_MAX} pixels — manual only
                    </span>
                    <span className="block font-body normal-case tracking-normal text-[9px] text-outline/75">
                      Set contract + RPC for live crowd tied to real pulls
                    </span>
                  </label>
                  <input
                    id="arena-crowd-grid"
                    type="range"
                    min={CROWD_GRID_MIN}
                    max={CROWD_GRID_MAX}
                    step={1}
                    value={crowdManual}
                    onChange={(e) => setCrowdManual(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer accent-tertiary"
                    title="Offline preview density when live pull feed is unavailable."
                    aria-valuemin={CROWD_GRID_MIN}
                    aria-valuemax={CROWD_GRID_MAX}
                    aria-valuenow={crowdManual}
                    aria-label="Manual crowd grid for demo when not connected to live pull metrics"
                  />
                </>
              )}
            </div>
            <button
              type="button"
              onClick={spawnPlayers}
              className={[
                "border px-5 py-2.5 font-label text-[10px] font-bold uppercase tracking-widest transition-all duration-300 sm:px-6 sm:py-3 sm:text-xs",
                isActive
                  ? "border-error bg-error text-on-error hover:opacity-95"
                  : "border-tertiary bg-tertiary text-on-tertiary-fixed hover:scale-[1.02] active:scale-[0.99]",
              ].join(" ")}
            >
              {isActive ? "Stop" : "Spawn"}
            </button>

            <div className="glass-panel flex min-w-0 max-w-full items-center gap-4 rounded-sm border border-dashed border-outline-variant px-4 py-3 sm:min-w-[13rem]">
              <div className="min-w-0 flex-1 text-right">
                <div className="font-label text-[10px] uppercase tracking-widest text-outline">
                  Arena pulls / sec
                </div>
                <p className="font-body text-[8px] normal-case leading-snug tracking-normal text-outline/70">
                  <span className="text-tertiary">Pulled</span> events · TugmonArena · recent blocks
                </p>
                <div className="font-headline text-xl font-bold tabular-nums tracking-tight text-tertiary sm:text-2xl">
                  {arenaPullTps != null ? (
                    <>
                      {formatChainTps(arenaPullTps)}{" "}
                      <span className="text-xs font-normal text-tertiary/80">/s</span>
                    </>
                  ) : (
                    <>
                      — <span className="text-xs font-normal text-tertiary/80">/s</span>
                    </>
                  )}
                </div>
                <div className="mt-2 border-t border-outline-variant/40 pt-2 font-label text-[9px] uppercase tracking-widest text-outline/90">
                  Monad network TPS
                </div>
                <p className="font-body text-[8px] normal-case leading-snug tracking-normal text-outline/60">
                  All txs on testnet · not only Tugmon
                </p>
                <div className="font-headline text-base font-bold tabular-nums tracking-tight text-on-surface-variant sm:text-lg">
                  {chainTps != null ? (
                    <>
                      {formatChainTps(chainTps)}{" "}
                      <span className="text-xs font-normal text-outline">TPS</span>
                    </>
                  ) : (
                    <>—</>
                  )}
                </div>
                {isActive && chainOk && onChainMatchPlaying && chainActivityDisplay > 0 && (
                  <p className="mt-1 font-label text-[9px] uppercase tracking-wider text-outline">
                    This session · score Δ ~{chainActivityDisplay} /s
                  </p>
                )}
              </div>
              <span
                className={`material-symbols-outlined text-3xl sm:text-4xl ${isActive ? "text-tertiary" : "text-outline"}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                speed
              </span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-sm border border-outline-variant bg-[#0a0812]">
          <div className="relative z-[2]">
            <ArenaCanvas
              isActive={isActive}
              crowdPerSide={crowdPerSide}
              onChainMatchPlaying={onChainMatchPlaying}
              knotTargetPct={knotTarget}
              redScore={redScore}
              blueScore={blueScore}
              redBoostActive={redBoostActive}
              blueBoostActive={blueBoostActive}
              redSabotaged={redSabotaged}
              blueSabotaged={blueSabotaged}
              scoresSource={chainOk && (!isActive || onChainMatchPlaying) ? "chain" : "demo"}
            />
          </div>

          <div
            className="pointer-events-none absolute left-1/2 top-4 z-[3] max-w-[min(96vw,520px)] -translate-x-1/2 px-2 text-center sm:top-6"
            suppressHydrationWarning
          >
            <div
              className={`relative px-6 py-3 font-headline text-base font-extrabold uppercase leading-snug tracking-tighter text-on-primary sm:px-10 sm:py-4 sm:text-xl md:text-2xl ${
                isActive ? "opacity-100" : "opacity-95"
              }`}
              style={{
                background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-container))",
              }}
              suppressHydrationWarning
            >
              <span className="pointer-events-none absolute -inset-[2px] -z-10 border-2 border-dashed border-secondary/50" />
              {sessionBannerText}
            </div>
          </div>
        </div>

        <p className="mt-4 text-center font-label text-[9px] uppercase tracking-widest text-outline/80">
          {contractConfigured && chainOk ? (
            <>
              Live scores from <span className="text-on-surface-variant">TugmonArena</span> on Monad testnet ·{" "}
              <span className="font-mono text-[10px] text-tertiary">{shortAddr(CONTRACT_ADDRESS)}</span>
            </>
          ) : contractConfigured ? (
            <>RPC did not return on-chain scores — links below still let you verify the contract in an explorer.</>
          ) : (
            <>Landing arena preview — add contract env for live rope sync.</>
          )}
        </p>
        {(arenaPullTps != null || chainTps != null) && (
          <p className="mx-auto mt-1 max-w-2xl text-center font-body text-[9px] leading-relaxed text-outline/75">
            {liveCrowdSide != null ? (
              <>
                <span className="font-label uppercase tracking-wider text-outline/80">Arena pulls/s</span> counts
                real <span className="text-on-surface-variant">Pulled</span> logs from the contract; the crowd
                grid follows that rate. <span className="font-label uppercase tracking-wider text-outline/80">
                  Network TPS
                </span>{" "}
                is the whole testnet — it only jumps when total chain traffic grows (your pulls are a slice).
                Stress Monad from <span className="text-on-surface-variant">/play</span> and coordinated raids;
                more arena pulls raise the top number and fill the stands.
              </>
            ) : (
              <>
                With a deployed contract, the arena reads live <span className="text-on-surface-variant">
                  Pulled
                </span>{" "}
                throughput and maps it to the crowd. Until then, the slider is a local preview only.{" "}
                <span className="font-label uppercase tracking-wider text-outline/80">Network TPS</span> stays
                a whole-chain metric. Open <span className="text-on-surface-variant">/play</span> to generate
                real pulls on Monad testnet.
              </>
            )}
          </p>
        )}
        {!(contractConfigured && chainOk) && (
          <p className="mt-1 text-center font-label text-[9px] uppercase tracking-widest text-outline/60">
            {!contractConfigured
              ? "Set NEXT_PUBLIC_CONTRACT_ADDRESS for on-chain rope position."
              : "Until RPC succeeds, the rope uses offline demo motion; scores here stay at 0."}
          </p>
        )}

        {contractConfigured && (
          <div className="mt-5 rounded-sm border border-dashed border-outline-variant bg-surface-container-low/95 p-4 sm:p-5">
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-tertiary">
              Prove on explorer (chain {getChainIdDisplay()})
            </p>
            <p className="mt-2 font-body text-xs leading-relaxed text-on-surface-variant">
              This page reads the same <span className="text-on-surface">TugmonArena</span> contract as{" "}
              <span className="text-on-surface">/play</span>: call{" "}
              <code className="rounded-sm bg-surface-container-highest px-1 py-0.5 font-mono text-[11px] text-secondary">
                redScore()
              </code>{" "}
              /{" "}
              <code className="rounded-sm bg-surface-container-highest px-1 py-0.5 font-mono text-[11px] text-secondary">
                blueScore()
              </code>{" "}
              or{" "}
              <code className="rounded-sm bg-surface-container-highest px-1 py-0.5 font-mono text-[11px] text-secondary">
                getGameInfo()
              </code>{" "}
              in the explorer &quot;Read contract&quot; tab — the numbers must match the R / B values in the canvas
              header after each sync.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={explorerAddressUrl(CONTRACT_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center border border-primary/50 bg-surface-container-high px-3 py-1.5 font-label text-[10px] font-bold uppercase tracking-wider text-primary transition hover:border-primary hover:bg-primary/10"
              >
                Open contract
              </a>
              {blockNumber != null && (
                <a
                  href={explorerBlockUrl(blockNumber)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center border border-outline-variant bg-surface-container-high px-3 py-1.5 font-label text-[10px] font-bold uppercase tracking-wider text-on-surface transition hover:border-tertiary hover:text-tertiary"
                >
                  View head block #{blockNumber}
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(CONTRACT_ADDRESS);
                }}
                className="inline-flex items-center border border-outline-variant bg-surface-container-high px-3 py-1.5 font-label text-[10px] font-bold uppercase tracking-wider text-on-surface-variant transition hover:border-on-surface hover:text-on-surface"
              >
                Copy address
              </button>
            </div>
            <p className="mt-3 break-all font-mono text-[10px] leading-relaxed text-outline">{CONTRACT_ADDRESS}</p>
            {rpcError && (
              <p className="mt-3 rounded-sm border border-error/30 bg-error/5 px-2 py-1.5 font-mono text-[10px] text-error">
                {rpcError}
              </p>
            )}
            <p className="mt-3 font-label text-[9px] uppercase tracking-widest text-outline/70">
              Explorer UI:{" "}
              <a
                className="text-tertiary underline-offset-2 hover:underline"
                href="https://docs.monad.xyz/tooling-and-infra/block-explorers"
                target="_blank"
                rel="noopener noreferrer"
              >
                Monad docs — block explorers
              </a>
              {" · "}
              Override base URL:{" "}
              <code className="text-on-surface-variant">NEXT_PUBLIC_EXPLORER_URL</code>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
