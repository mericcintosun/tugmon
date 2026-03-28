'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import TpsDisplay from '@/components/TpsDisplay';
import { CommunityStatsBoard } from '@/components/CommunityStatsBoard';
import { CONTRACT_ADDRESS, CONTRACT_ABI, ROLE_META, type RoleId } from '@/utils/constants';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz';
const POLL_MS = 2000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerRecord {
  address:  string;
  nickname: string;
  team:     number;
  roleId:   RoleId;
  pulls:    number;
  specials: number;
}

interface GameState {
  redScore:      number;
  blueScore:     number;
  lastReset:     number;
  gameDuration:  number;
  redBoosted:    boolean;
  blueBoosted:   boolean;
  redSabotaged:  boolean;
  blueSabotaged: boolean;
}

interface Spotlight {
  name:   string;
  action: string;
  team:   number;
  emoji:  string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TugmonDashboard() {
  const [game, setGame] = useState<GameState>({
    redScore: 0, blueScore: 0, lastReset: 0, gameDuration: 3600,
    redBoosted: false, blueBoosted: false, redSabotaged: false, blueSabotaged: false,
  });
  const [players,    setPlayers]   = useState<Map<string, PlayerRecord>>(new Map());
  const [spotlight,  setSpotlight] = useState<Spotlight | null>(null);
  const [countdown,  setCountdown] = useState('--:--:--');
  const [eventCount, setEventCount] = useState(0);
  const [loading,    setLoading]   = useState(true);
  const [flashOverlay, setFlash]   = useState<null | 'red' | 'yellow'>(null);
  const [chainBlockTxCount, setChainBlockTxCount] = useState<number | null>(null);
  const [chainBlockDeltaSec, setChainBlockDeltaSec] = useState<number | null>(null);

  const lastBlockRef = useRef<number>(0);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const triggerFlash = useCallback((color: 'red' | 'yellow') => {
    setFlash(color);
    setTimeout(() => setFlash(null), 800);
  }, []);

  const triggerSpotlight = useCallback((address: string, action: string, emoji: string, map: Map<string, PlayerRecord>) => {
    const p    = map.get(address);
    const name = p?.nickname || `${address.slice(0,6)}…${address.slice(-4)}`;
    setSpotlight({ name, action, team: p?.team ?? 0, emoji });
    setTimeout(() => setSpotlight(null), 4000);
  }, []);

  const upsertPlayer = useCallback((address: string, patch: Partial<PlayerRecord>) => {
    setPlayers(prev => {
      const m    = new Map(prev);
      const curr = m.get(address) ?? { address, nickname: '', team: 0, roleId: 0 as RoleId, pulls: 0, specials: 0 };
      m.set(address, { ...curr, ...patch });
      return m;
    });
  }, []);

  // ── Init + polling ──────────────────────────────────────────────────────────
  useEffect(() => {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const iface    = new ethers.Interface(CONTRACT_ABI);
    let stopped    = false;

    const fetchGameState = async () => {
      try {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const [red, blue, lastReset, dur, rbEnd, bbEnd, rsEnd, bsEnd] = await contract.getGameInfo();
        const nowSec = BigInt(Math.floor(Date.now() / 1000));

        setGame({
          redScore: Number(red), blueScore: Number(blue),
          lastReset: Number(lastReset), gameDuration: Number(dur),
          redBoosted:    BigInt(rbEnd) > nowSec,  blueBoosted:  BigInt(bbEnd) > nowSec,
          redSabotaged:  BigInt(rsEnd) > nowSec,  blueSabotaged:BigInt(bsEnd) > nowSec,
        });
        setLoading(false);
      } catch { /* silently ignore */ }
    };

    const fetchLogs = async () => {
      try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = lastBlockRef.current > 0
          ? lastBlockRef.current
          : Math.max(0, currentBlock - 20); // catch last 20 blocks on first load

        if (currentBlock <= lastBlockRef.current) return;
        lastBlockRef.current = currentBlock;

        const logs = await provider.getLogs({
          address: CONTRACT_ADDRESS,
          fromBlock,
          toBlock: currentBlock,
        });

        // We need the players map for triggerSpotlight — use functional updates
        setPlayers(prevPlayers => {
          let nextPlayers = new Map(prevPlayers);
          let redScore = 0, blueScore = 0, shouldUpdateScores = false;

          for (const log of logs) {
            try {
              const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
              if (!parsed) continue;

              if (parsed.name === 'PlayerJoined') {
                const addr  = parsed.args[0] as string;
                const tTeam = Number(parsed.args[1]);
                const role  = Number(parsed.args[3]) as RoleId;
                const nick  = parsed.args[4] as string;
                const curr  = nextPlayers.get(addr) ?? { address: addr, nickname: '', team: 0, roleId: 0 as RoleId, pulls: 0, specials: 0 };
                nextPlayers.set(addr, { ...curr, nickname: nick, team: tTeam, roleId: role });

              } else if (parsed.name === 'Pulled') {
                const addr = parsed.args[0] as string;
                redScore = Number(parsed.args[2]);
                blueScore = Number(parsed.args[3]);
                shouldUpdateScores = true;
                const curr = nextPlayers.get(addr) ?? { address: addr, nickname: '', team: 0, roleId: 0 as RoleId, pulls: 0, specials: 0 };
                nextPlayers.set(addr, { ...curr, pulls: curr.pulls + 1 });
                setEventCount(n => n + 1);

              } else if (parsed.name === 'Boosted') {
                const addr    = parsed.args[0] as string;
                const teamNum = Number(parsed.args[1]);
                const endTime = parsed.args[2] as bigint;
                const key     = teamNum === 1 ? 'redBoosted' : 'blueBoosted';
                const ms      = Number(endTime) * 1000 - Date.now();
                setGame(prev => ({ ...prev, [key]: true }));
                setTimeout(() => setGame(prev => ({ ...prev, [key]: false })), Math.max(ms, 0) + 400);
                setEventCount(n => n + 1);
                triggerFlash('yellow');
                const curr = nextPlayers.get(addr) ?? { address: addr, nickname: '', team: teamNum, roleId: 3 as RoleId, pulls: 0, specials: 0 };
                nextPlayers.set(addr, { ...curr, specials: curr.specials + 1 });
                triggerSpotlight(addr, 'NITRO ACTIVE', '⚡', nextPlayers);

              } else if (parsed.name === 'Sabotaged') {
                const addr       = parsed.args[0] as string;
                const targetTeam = Number(parsed.args[1]);
                const endTime    = parsed.args[2] as bigint;
                const key        = targetTeam === 1 ? 'redSabotaged' : 'blueSabotaged';
                const ms         = Number(endTime) * 1000 - Date.now();
                const myTeam     = targetTeam === 1 ? 2 : 1;
                setGame(prev => ({ ...prev, [key]: true }));
                setTimeout(() => setGame(prev => ({ ...prev, [key]: false })), Math.max(ms, 0) + 400);
                setEventCount(n => n + 1);
                triggerFlash('red');
                const curr = nextPlayers.get(addr) ?? { address: addr, nickname: '', team: myTeam, roleId: 2 as RoleId, pulls: 0, specials: 0 };
                nextPlayers.set(addr, { ...curr, specials: curr.specials + 1 });
                triggerSpotlight(addr, targetTeam === 1 ? '🔴 RED TEAM FROZEN' : '🔵 BLUE TEAM FROZEN', '💣', nextPlayers);

              } else if (parsed.name === 'GameReset') {
                setGame(prev => ({ ...prev, redScore: 0, blueScore: 0, redBoosted: false, blueBoosted: false, redSabotaged: false, blueSabotaged: false }));
                nextPlayers = new Map();
              }
            } catch { /* unknown log */ }
          }

          if (shouldUpdateScores) {
            setGame(prev => ({ ...prev, redScore, blueScore }));
          }

          return nextPlayers;
        });
      } catch { /* network errors */ }
    };

    const poll = async () => {
      if (stopped) return;
      await Promise.all([fetchGameState(), fetchLogs()]);
    };

    void poll();
    const id = setInterval(() => { void poll(); }, POLL_MS);

    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [triggerFlash, triggerSpotlight, upsertPlayer]);

  // ── Chain snapshot (RPC): last block tx count — not global network TPS ───────
  useEffect(() => {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    let cancelled = false;
    const pollChain = async () => {
      try {
        const cur = await provider.getBlock('latest', true);
        if (!cur || cancelled) return;
        const txs = Array.isArray(cur.transactions) ? cur.transactions.length : 0;
        let dt = 1;
        const blockNum = Number(cur.number);
        if (blockNum > 0) {
          const prev = await provider.getBlock(blockNum - 1, false);
          if (prev) dt = Math.max(1, Number(cur.timestamp - prev.timestamp));
        }
        if (!cancelled) {
          setChainBlockTxCount(txs);
          setChainBlockDeltaSec(dt);
        }
      } catch { /* ignore */ }
    };
    void pollChain();
    const cid = setInterval(() => { void pollChain(); }, 3000);
    return () => {
      cancelled = true;
      clearInterval(cid);
    };
  }, []);

  // ── Countdown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!game.lastReset) return;
    const tick = () => {
      const diff = (game.lastReset + game.gameDuration) * 1000 - Date.now();
      if (diff <= 0) { setCountdown('00:00:00'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff %    60_000) /  1_000);
      setCountdown(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [game.lastReset, game.gameDuration]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const sum = game.redScore + game.blueScore;
  const redPct = sum === 0 ? 50 : (game.redScore / sum) * 100;
  const bluePct = 100 - redPct;

  const top3 = [...players.values()]
    .sort((a, b) => (b.pulls + b.specials * 5) - (a.pulls + a.specials * 5))
    .slice(0, 3);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-background">
      <div className="space-y-6 text-center">
        <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-t-primary border-r-transparent border-b-secondary border-l-transparent" />
        <div className="animate-pulse font-headline text-3xl font-black italic tracking-tighter text-on-surface">
          TUGMON ARENA
        </div>
        <div className="font-label text-sm text-outline">Connecting…</div>
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-0 flex-1 select-none flex-col overflow-hidden bg-background text-on-surface">
      {/* Background — same vocabulary as landing / play */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.5]">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -15%, rgba(175, 162, 255, 0.1), transparent), radial-gradient(ellipse 55% 45% at 100% 40%, rgba(161, 250, 255, 0.05), transparent), radial-gradient(ellipse 50% 40% at 0% 85%, rgba(255, 103, 174, 0.04), transparent)",
          }}
        />
      </div>

      <AnimatePresence>
        {flashOverlay && (
          <motion.div
            key={flashOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-0 z-30"
            style={{
              background:
                flashOverlay === "red" ? "rgba(239,68,68,0.16)" : "rgba(234,179,8,0.12)",
            }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-8 overflow-auto px-4 py-8 sm:gap-10 sm:px-6 sm:py-10 md:px-8">
        {/* ── Hero strip (matches landing “Real-time arena” header) ── */}
        <section className="relative overflow-hidden rounded-sm bg-surface-container-low p-6 sm:p-8 md:p-10 stitched-border">
          <div className="absolute right-0 top-0 p-2 font-label text-[9px] uppercase tracking-[0.45em] text-tertiary opacity-50 sm:p-3 sm:text-[10px]">
            WAR_ROOM · LIVE
          </div>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-2 font-label text-[10px] font-bold uppercase tracking-[0.3em] text-tertiary">
                Monad testnet
              </p>
              <h1 className="font-headline text-3xl font-extrabold leading-[1.05] tracking-tighter text-on-surface sm:text-4xl md:text-5xl lg:text-6xl">
                TUGMON <span className="text-primary">ARENA.</span>
              </h1>
              <p className="mt-3 font-body text-sm text-on-surface-variant sm:text-base">
                Real-time on-chain scores, crew pull leaderboard, and session activity — stitched to the same atelier
                chrome as the rest of Tugmon.
              </p>
              <p className="mt-3 font-label text-xs text-on-surface-variant">
                BOARD STATE: <span className="text-tertiary">SYNCED</span>
                <span className="mx-2 text-outline">|</span>
                RPC: <span className="text-secondary">ACTIVE</span>
              </p>
            </div>
            <div className="glass-panel flex w-full shrink-0 flex-col gap-2 rounded-sm border border-dashed border-outline-variant p-4 shadow-patch sm:max-w-md lg:w-auto lg:min-w-[min(100%,20rem)]">
              <div className="flex items-center gap-3">
                <span
                  className="material-symbols-outlined text-3xl text-tertiary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  monitoring
                </span>
                <span className="font-label text-[10px] font-bold uppercase tracking-widest text-outline">
                  Session activity
                </span>
              </div>
              <TpsDisplay
                eventCount={eventCount}
                chainBlockTxCount={chainBlockTxCount}
                chainBlockDeltaSec={chainBlockDeltaSec}
                align="start"
              />
            </div>
          </div>
        </section>

        {/* ── Scoreboard + tug meter (patch card) ── */}
        <section className="overflow-hidden rounded-sm bg-surface-container p-5 sm:p-8 md:p-10 stitched-border shadow-patch">
          <div className="mb-8 flex flex-col justify-between gap-4 border-b border-dashed border-outline-variant/80 pb-6 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-headline text-xl font-bold uppercase tracking-tight text-on-surface sm:text-2xl">
                Live scores
              </h2>
              <p className="mt-1 font-label text-xs text-on-surface-variant sm:text-sm">
                RED vs BLUE · knot tracks red share of total pulls
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-8 px-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:px-2">
            <div className="flex flex-col items-center sm:items-start">
              <motion.span
                key={game.redScore}
                initial={{ opacity: 0.5, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`font-headline font-black tabular-nums leading-none ${
                  game.redSabotaged ? "animate-glitch text-on-surface-variant" : "text-red-500"
                }`}
                style={{
                  fontSize: "clamp(3.5rem, 10vw, 8rem)",
                  textShadow: game.redSabotaged ? "none" : "0 0 48px rgba(239,68,68,0.35)",
                }}
              >
                {game.redScore}
              </motion.span>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span
                  className={`font-label text-sm font-black uppercase tracking-[0.35em] sm:text-lg sm:tracking-[0.5em] ${
                    game.redSabotaged ? "animate-pulse text-tertiary" : "text-red-400/80"
                  }`}
                >
                  {game.redSabotaged ? "❄️ FROZEN" : "🔴 RED"}
                </span>
                {game.redBoosted && (
                  <span className="font-label text-lg font-black text-secondary animate-pulse">⚡ NITRO</span>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col items-center gap-3 sm:min-w-[220px]">
              <span className="font-headline text-2xl font-black text-primary sm:text-3xl">VS</span>
              <AnimatePresence mode="wait">
                {spotlight ? (
                  <motion.div
                    key={`spotlight-${spotlight.name}`}
                    initial={{ opacity: 0, scale: 0.92, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    className={`w-full max-w-sm rounded-sm border border-dashed px-5 py-4 text-center glass-panel ${
                      spotlight.team === 1
                        ? "border-red-500/45 bg-red-500/10"
                        : spotlight.team === 2
                          ? "border-blue-500/45 bg-blue-500/10"
                          : "border-amber-500/45 bg-amber-500/10"
                    }`}
                  >
                    <div className="font-headline text-xl font-black text-on-surface sm:text-2xl">{spotlight.action}</div>
                    <div className="mt-1 font-mono text-sm text-on-surface-variant">{spotlight.name}</div>
                    <div className="mt-2 text-2xl">{spotlight.emoji}</div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="font-label text-[10px] font-bold uppercase tracking-[0.28em] text-outline animate-pulse"
                  >
                    Awaiting action
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col items-center sm:items-end">
              <motion.span
                key={game.blueScore}
                initial={{ opacity: 0.5, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`font-headline font-black tabular-nums leading-none ${
                  game.blueSabotaged ? "animate-glitch text-on-surface-variant" : "text-blue-500"
                }`}
                style={{
                  fontSize: "clamp(3.5rem, 10vw, 8rem)",
                  textShadow: game.blueSabotaged ? "none" : "0 0 48px rgba(59,130,246,0.35)",
                }}
              >
                {game.blueScore}
              </motion.span>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                {game.blueBoosted && (
                  <span className="font-label text-lg font-black text-secondary animate-pulse">⚡ NITRO</span>
                )}
                <span
                  className={`font-label text-sm font-black uppercase tracking-[0.35em] sm:text-lg sm:tracking-[0.5em] ${
                    game.blueSabotaged ? "animate-pulse text-secondary" : "text-blue-400/80"
                  }`}
                >
                  {game.blueSabotaged ? "FROZEN ❄️" : "BLUE 🔵"}
                </span>
              </div>
            </div>
          </div>

          <div className="relative mt-10 h-16 w-full overflow-visible rounded-sm border border-dashed border-outline-variant bg-surface-container-low shadow-inner">
            <motion.div
              initial={{ width: "50%" }}
              animate={{ width: `${redPct}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`absolute left-0 top-0 h-full rounded-l-sm ${
                game.redSabotaged
                  ? "animate-pulse bg-on-surface-variant/40"
                  : game.redBoosted
                    ? "shimmer-gold"
                    : "bg-gradient-to-r from-red-900 to-red-500"
              }`}
            />
            <motion.div
              initial={{ width: "50%" }}
              animate={{ width: `${bluePct}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`absolute right-0 top-0 h-full rounded-r-sm ${
                game.blueSabotaged
                  ? "animate-pulse bg-on-surface-variant/40"
                  : game.blueBoosted
                    ? "shimmer-gold"
                    : "bg-gradient-to-l from-blue-900 to-blue-500"
              }`}
            />

            <motion.div
              initial={{ left: "50%" }}
              animate={{ left: `${redPct}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute top-1/2 z-10"
              style={{ transform: "translate(-50%, -50%)" }}
            >
              <div className="group relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-2 border-dashed border-secondary bg-surface-container-highest text-3xl shadow-patch sm:h-20 sm:w-20 sm:text-4xl">
                <span className="absolute -inset-1 -z-10 rounded-full border border-dashed border-primary/40 opacity-60" />
                🚀
              </div>
            </motion.div>

            <div className="pointer-events-none absolute inset-0 flex items-center select-none">
              <span className="ml-4 font-label text-xs font-black tabular-nums text-on-surface sm:text-sm">
                {Math.round(redPct)}%
              </span>
              <span className="ml-auto mr-4 font-label text-xs font-black tabular-nums text-on-surface sm:text-sm">
                {Math.round(bluePct)}%
              </span>
            </div>
          </div>
        </section>

        {/* ── Social pressure (stitched panel) ── */}
        <section className="rounded-sm bg-surface-container-high p-5 sm:p-8 stitched-border shadow-patch">
          <CommunityStatsBoard variant="full" showShare />
        </section>

        {/* ── Bottom grid ── */}
        <div className="mt-auto grid grid-cols-1 gap-5 pb-4 md:grid-cols-3 md:gap-6">

          {/* MVP Leaderboard */}
          <div className="col-span-1 flex flex-col gap-3 rounded-sm bg-surface-container-high p-5 stitched-border">
            <span className="font-label text-[10px] font-black uppercase tracking-widest text-outline">
              🏆 MVP BOARD
            </span>
            {top3.length === 0 ? (
              <span className="animate-pulse font-body text-xs text-outline">Waiting for players…</span>
            ) : top3.map((p, i) => {
              const meta = ROLE_META[p.roleId];
              const score = p.pulls + p.specials * 5;
              return (
                <div key={p.address} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{['🥇','🥈','🥉'][i]}</span>
                    <div className="flex flex-col">
                      <span className={`text-xs font-black ${p.team === 1 ? 'text-red-400' : 'text-blue-400'}`}>
                        {p.nickname || `${p.address.slice(0,6)}…`}
                      </span>
                      <span className="font-body text-[9px] text-outline">
                        {meta.emoji} {meta.label}
                      </span>
                    </div>
                  </div>
                  <span className="font-label font-black tabular-nums text-on-surface">{score}</span>
                </div>
              );
            })}
            <div className="mt-auto border-t border-dashed border-outline-variant pt-2 font-label text-[9px] text-outline">
              {players.size} players joined
            </div>
          </div>

          {/* Center stats */}
          <div className="col-span-1 flex flex-col gap-4">
            {/* Contract */}
            <div className="flex flex-col gap-1 rounded-sm bg-surface-container-high p-4 stitched-border">
              <span className="font-label text-[9px] font-bold uppercase tracking-widest text-outline">
                CONTRACT
              </span>
              <span className="truncate font-mono text-xs text-primary">{CONTRACT_ADDRESS}</span>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-tertiary" />
                <span className="font-label text-[9px] font-bold text-tertiary">LIVE</span>
              </div>
            </div>

            {/* Countdown */}
            <div className="flex flex-1 flex-col gap-1 rounded-sm bg-surface-container-high p-4 stitched-border">
              <span className="font-label text-[9px] font-bold uppercase tracking-widest text-outline">
                ROUND RESET
              </span>
              <span className="font-label text-2xl font-black tabular-nums text-on-surface">{countdown}</span>
            </div>
          </div>

          {/* QR Code */}
          <div className="col-span-1 flex flex-col items-center gap-3 rounded-sm bg-surface-container-high p-5 stitched-border">
            <span className="font-label text-[10px] font-black uppercase tracking-widest text-outline">
              Scan to play
            </span>
            <div className="rounded-sm bg-white p-2 shadow-patch">
              <QRCodeSVG
                value={`${appUrl}/play`}
                size={120}
                bgColor="#ffffff"
                fgColor="#2c0097"
                level="M"
              />
            </div>
            <div className="text-center">
              <div className="break-all font-mono text-[9px] text-outline">{appUrl}/play</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
