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
                const _communityId = Number(parsed.args[2]);
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
  const total   = game.redScore + game.blueScore || 1;
  const redPct  = (game.redScore  / total) * 100;
  const bluePct = 100 - redPct;

  const top3 = [...players.values()]
    .sort((a, b) => (b.pulls + b.specials * 5) - (a.pulls + a.specials * 5))
    .slice(0, 3);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-[#020205]">
      <div className="text-center space-y-6">
        <div className="w-16 h-16 border-4 border-t-indigo-500 border-r-transparent border-b-purple-500 border-l-transparent rounded-full animate-spin mx-auto" />
        <div className="text-3xl font-black italic text-white tracking-tighter animate-pulse">TUGMON ARENA</div>
        <div className="text-sm text-gray-600">Connecting…</div>
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-0 flex-1 select-none flex-col overflow-hidden bg-[#020205] text-white scanlines">

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[40vw] h-[50vh] bg-red-700/6  blur-[180px]" />
        <div className="absolute bottom-0 right-0 w-[40vw] h-[50vh] bg-blue-700/6 blur-[180px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,20,60,0.4)_0%,transparent_70%)]" />
      </div>

      {/* Flash overlay */}
      <AnimatePresence>
        {flashOverlay && (
          <motion.div
            key={flashOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-30 pointer-events-none"
            style={{
              background: flashOverlay === 'red'
                ? 'rgba(239,68,68,0.18)'
                : 'rgba(234,179,8,0.15)',
            }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4 sm:p-8">

        {/* ── TOP BAR ── */}
        <div className="flex justify-between items-start">
          <div>
            <h1
              className="font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500"
              style={{ fontSize: 'clamp(3rem, 6vw, 5.5rem)', lineHeight: 1 }}
            >
              TUGMON ARENA
            </h1>
            <p className="text-gray-600 text-sm uppercase tracking-[0.4em] font-bold mt-1 pl-0.5">
              Real-Time On-Chain · Monad Testnet
            </p>
          </div>
          <TpsDisplay
            eventCount={eventCount}
            chainBlockTxCount={chainBlockTxCount}
            chainBlockDeltaSec={chainBlockDeltaSec}
          />
        </div>

        {/* ── GIANT SCORES ── */}
        <div className="flex justify-between items-end px-4">
          {/* Red score */}
          <div className="flex flex-col items-start">
            <motion.span
              key={game.redScore}
              initial={{ opacity: 0.5, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`font-black tabular-nums leading-none ${game.redSabotaged ? 'text-gray-500 animate-glitch' : 'text-red-500'}`}
              style={{
                fontSize: 'clamp(5rem, 12vw, 10rem)',
                textShadow: game.redSabotaged ? 'none' : '0 0 60px rgba(239,68,68,0.4)',
              }}
            >
              {game.redScore}
            </motion.span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-lg font-black uppercase tracking-[0.5em] ${game.redSabotaged ? 'text-blue-300 animate-pulse' : 'text-red-400/50'}`}>
                {game.redSabotaged ? '❄️ FROZEN' : '🔴 RED'}
              </span>
              {game.redBoosted && <span className="text-yellow-300 font-black animate-pulse text-xl">⚡ NITRO</span>}
            </div>
          </div>

          {/* VS / Spotlight */}
          <div className="flex flex-col items-center gap-2 min-w-[200px]">
            <span className="text-3xl font-black text-gray-800">VS</span>
            <AnimatePresence mode="wait">
              {spotlight ? (
                <motion.div
                  key={`spotlight-${spotlight.name}`}
                  initial={{ opacity: 0, scale: 0.8, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={`text-center px-6 py-3 rounded-2xl border backdrop-blur-md ${
                    spotlight.team === 1
                      ? 'bg-red-500/10 border-red-500/30'
                      : spotlight.team === 2
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-yellow-500/10 border-yellow-500/30'
                  }`}
                >
                  <div className="text-3xl font-black text-white">{spotlight.action}</div>
                  <div className="text-base font-mono text-gray-400 mt-1">{spotlight.name}</div>
                  <div className="text-2xl mt-1">{spotlight.emoji}</div>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-gray-700 uppercase tracking-widest font-bold animate-pulse"
                >
                  AWAITING ACTION
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Blue score */}
          <div className="flex flex-col items-end">
            <motion.span
              key={game.blueScore}
              initial={{ opacity: 0.5, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`font-black tabular-nums leading-none ${game.blueSabotaged ? 'text-gray-500 animate-glitch' : 'text-blue-500'}`}
              style={{
                fontSize: 'clamp(5rem, 12vw, 10rem)',
                textShadow: game.blueSabotaged ? 'none' : '0 0 60px rgba(59,130,246,0.4)',
              }}
            >
              {game.blueScore}
            </motion.span>
            <div className="flex items-center gap-2 mt-1 justify-end">
              {game.blueBoosted && <span className="text-yellow-300 font-black animate-pulse text-xl">NITRO ⚡</span>}
              <span className={`text-lg font-black uppercase tracking-[0.5em] ${game.blueSabotaged ? 'text-red-300 animate-pulse' : 'text-blue-400/50'}`}>
                {game.blueSabotaged ? 'FROZEN ❄️' : 'BLUE 🔵'}
              </span>
            </div>
          </div>
        </div>

        {/* ── TUG BAR ── */}
        <div className="relative w-full h-14 rounded-full overflow-visible bg-gray-950 border border-white/5 shadow-inner">
          {/* Red fill */}
          <motion.div
            initial={{ width: "50%" }}
            animate={{ width: `${redPct}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`absolute left-0 top-0 h-full rounded-l-full ${
              game.redSabotaged ? 'bg-gray-600 animate-pulse' :
              game.redBoosted   ? 'shimmer-gold' :
              'bg-gradient-to-r from-red-900 to-red-500'
            }`}
          />
          {/* Blue fill */}
          <motion.div
            initial={{ width: "50%" }}
            animate={{ width: `${bluePct}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`absolute right-0 top-0 h-full rounded-r-full ${
              game.blueSabotaged ? 'bg-gray-600 animate-pulse' :
              game.blueBoosted   ? 'shimmer-gold' :
              'bg-gradient-to-l from-blue-900 to-blue-500'
            }`}
          />

          {/* Moving center knot */}
          <motion.div
            initial={{ left: "50%" }}
            animate={{ left: `${redPct}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute top-1/2 z-10"
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <div className="w-20 h-20 rounded-full bg-white border-4 border-indigo-500 flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(99,102,241,0.8)]">
              🚀
            </div>
          </motion.div>

          {/* Percentage labels */}
          <div className="absolute inset-0 flex items-center pointer-events-none select-none">
            <span className="ml-4 text-white/60 font-black text-sm">{Math.round(redPct)}%</span>
            <span className="ml-auto mr-4 text-white/60 font-black text-sm">{Math.round(bluePct)}%</span>
          </div>
        </div>

        {/* ── GMONAD COMMUNITY TX LEADERBOARD ── */}
        <div className="rounded-2xl border border-violet-500/20 bg-[#080810]/90 p-5 shadow-[0_0_40px_rgba(139,92,246,0.08)]">
          <CommunityStatsBoard variant="full" showShare />
        </div>

        {/* ── BOTTOM GRID ── */}
        <div className="mt-auto grid grid-cols-1 gap-5 md:grid-cols-3">

          {/* MVP Leaderboard */}
          <div className="col-span-1 bg-white/3 border border-white/5 rounded-2xl p-5 flex flex-col gap-3">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">🏆 MVP BOARD</span>
            {top3.length === 0 ? (
              <span className="text-xs text-gray-600 animate-pulse">Waiting for players…</span>
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
                      <span className="text-[9px] text-gray-600">{meta.emoji} {meta.label}</span>
                    </div>
                  </div>
                  <span className="font-black text-white tabular-nums">{score}</span>
                </div>
              );
            })}
            <div className="mt-auto pt-2 border-t border-white/5 text-[9px] text-gray-700">
              {players.size} players joined
            </div>
          </div>

          {/* Center stats */}
          <div className="col-span-1 flex flex-col gap-4">
            {/* Contract */}
            <div className="bg-white/3 border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
              <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">CONTRACT</span>
              <span className="font-mono text-indigo-400 text-xs truncate">{CONTRACT_ADDRESS}</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping inline-block" />
                <span className="text-[9px] text-green-500 font-bold">LIVE</span>
              </div>
            </div>

            {/* Countdown */}
            <div className="bg-white/3 border border-white/5 rounded-2xl p-4 flex flex-col gap-1 flex-1">
              <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">ROUND RESET</span>
              <span className="font-orbitron font-black text-white text-2xl tabular-nums">{countdown}</span>
            </div>
          </div>

          {/* QR Code */}
          <div className="col-span-1 bg-white/3 border border-white/5 rounded-2xl p-5 flex flex-col items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Scan to play</span>
            <div className="bg-white rounded-xl p-2">
              <QRCodeSVG
                value={`${appUrl}/play`}
                size={120}
                bgColor="#ffffff"
                fgColor="#040408"
                level="M"
              />
            </div>
            <div className="text-center">
              <div className="text-[9px] text-gray-600 font-mono break-all">{appUrl}/play</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
