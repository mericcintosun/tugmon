'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { throttle } from 'lodash';
import { ethers } from 'ethers';

import {
  TEAMS,
  ROLE_ID,
  ROLE_META,
  CONTRACT_ABI,
  type TeamId,
  type RoleId,
  CONTRACT_ADDRESS as ENV_CONTRACT_ADDRESS,
} from '@/utils/constants';
import CanvasGame from '@/components/CanvasGame';
import {
  getOrCreateBurnerWallet,
  fundBurnerWallet,
  waitForBalance,
  getBurnerWalletMode,
} from '@/lib/burnerWallet';

// ─── Constants ─────────────────────────────────────────────────────────────────

const CONTRACT_ADDRESS = ENV_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz';
const POLL_INTERVAL_MS = 2500; // Poll game state + events every 2.5s

// Monad Testnet RPC does not support eth_newFilter / eth_newBlockFilter.
// We use getLogs polling instead of contract.on() for event subscriptions.

// ─── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | 'loading'      // initial mount
  | 'nickname'     // user entering nickname
  | 'funding'      // funding burner wallet via /api/fund
  | 'joining'      // sending join() tx on-chain
  | 'playing'      // in game
  | 'round_over';  // round ended, waiting for reset

interface Particle {
  id: number;
  x: number;
  y: number;
  drift: number;
  label: string;
}

interface GameState {
  redScore: number;
  blueScore: number;
  redBoosted: boolean;
  blueBoosted: boolean;
  redSabotaged: boolean;
  blueSabotaged: boolean;
  lastReset: number;
}

const teamGrad: Record<TeamId, string> = {
  1: 'from-red-950 via-red-900/60 to-[#040408]',
  2: 'from-blue-950 via-blue-900/60 to-[#040408]',
};

// ─── Game Session ───────────────────────────────────────────────────────────────

function GameSession() {
  const [phase, setPhase] = useState<Phase>('nickname');
  // Initialize nickname from localStorage during first render (client-only, gated by 'use client')
  const [nickname, setNickname] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tugmon_nickname') ?? '';
    }
    return '';
  });
  const [team, setTeam] = useState<TeamId | null>(null);
  const [roleId, setRoleId] = useState<RoleId>(0);

  const [game, setGame] = useState<GameState>({
    redScore: 0,
    blueScore: 0,
    redBoosted: false,
    blueBoosted: false,
    redSabotaged: false,
    blueSabotaged: false,
    lastReset: 0,
  });

  const [particles, setParticles] = useState<Particle[]>([]);
  const [pumpCd, setPumpCd] = useState(false);
  const [txStatus, setTxStatus] = useState<{ msg: string; type: 'pending' | 'ok' | 'err' } | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [showSabAlert, setShowSabAlert] = useState(false);
  const [balance, setBalance] = useState<string>('0.000');

  const sabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBlockRef = useRef<number>(0);

  const burnerWalletRef = useRef<ethers.Wallet | null>(null);
  const arenaContractRef = useRef<ethers.Contract | null>(null);
  const [burnerAddress, setBurnerAddress] = useState<string | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const showStatus = useCallback((msg: string, type: 'pending' | 'ok' | 'err', autoDismissMs?: number) => {
    setTxStatus({ msg, type });
    if (autoDismissMs) setTimeout(() => setTxStatus(null), autoDismissMs);
  }, []);

  const getProvider = useCallback(() => new ethers.JsonRpcProvider(RPC_URL), []);

  // ── Poll balance ────────────────────────────────────────────────────────────

  const refreshBalance = useCallback(async () => {
    if (!burnerWalletRef.current) return;
    try {
      const provider = getProvider();
      const bal = await provider.getBalance(burnerWalletRef.current.address);
      setBalance(Number(ethers.formatEther(bal)).toFixed(3));
    } catch {
      // silently ignore
    }
  }, [getProvider]);

  // ── Poll game state ─────────────────────────────────────────────────────────

  const pollGameState = useCallback(async () => {
    try {
      const provider = getProvider();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const info = await contract.getGameInfo();
      const nowSec = BigInt(Math.floor(Date.now() / 1000));

      setGame({
        redScore: Number(info[0]),
        blueScore: Number(info[1]),
        lastReset: Number(info[2]),
        redBoosted: BigInt(info[4]) > nowSec,
        blueBoosted: BigInt(info[5]) > nowSec,
        redSabotaged: BigInt(info[6]) > nowSec,
        blueSabotaged: BigInt(info[7]) > nowSec,
      });
    } catch {
      // ignore polling errors silently
    }
  }, [getProvider]);

  // ── Poll events via getLogs (Monad RPC doesn't support eth_newFilter) ─────────

  const pollEventsRef = useRef<TeamId | null>(null);

  const pollLogs = useCallback(async (myTeam: TeamId) => {
    try {
      const provider = getProvider();

      // Get current block
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = lastBlockRef.current > 0 ? lastBlockRef.current : Math.max(0, currentBlock - 5);
      if (currentBlock <= lastBlockRef.current) return;
      lastBlockRef.current = currentBlock;

      const iface = new ethers.Interface(CONTRACT_ABI);
      const logs = await provider.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock,
        toBlock: currentBlock,
      });

      for (const log of logs) {
        try {
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (!parsed) continue;

          if (parsed.name === 'Pulled') {
            const r = parsed.args[2] as bigint;
            const b = parsed.args[3] as bigint;
            setGame(prev => ({ ...prev, redScore: Number(r), blueScore: Number(b) }));
            setEventCount(n => n + 1);
          } else if (parsed.name === 'Boosted') {
            const teamNum = Number(parsed.args[1]);
            const endTime = parsed.args[2] as bigint;
            const key = teamNum === 1 ? 'redBoosted' : 'blueBoosted';
            const ms = Number(endTime) * 1000 - Date.now();
            setGame(prev => ({ ...prev, [key]: true }));
            setTimeout(() => setGame(prev => ({ ...prev, [key]: false })), Math.max(ms, 0) + 400);
            setEventCount(n => n + 1);
          } else if (parsed.name === 'Sabotaged') {
            const targetTeam = Number(parsed.args[1]);
            const endTime = parsed.args[2] as bigint;
            const key = targetTeam === 1 ? 'redSabotaged' : 'blueSabotaged';
            const ms = Number(endTime) * 1000 - Date.now();
            setGame(prev => ({ ...prev, [key]: true }));
            setTimeout(() => setGame(prev => ({ ...prev, [key]: false })), Math.max(ms, 0) + 400);
            setEventCount(n => n + 1);
            if (targetTeam === myTeam) {
              setShowSabAlert(true);
              if (sabTimerRef.current) clearTimeout(sabTimerRef.current);
              sabTimerRef.current = setTimeout(() => setShowSabAlert(false), 3000);
            }
          } else if (parsed.name === 'GameReset') {
            setPhase('round_over');
            setTimeout(() => {
              void pollGameState();
              setPhase('playing');
            }, 5000);
          }
        } catch {
          // unknown log, skip
        }
      }
    } catch {
      // network errors — silently ignore
    }
  }, [getProvider, pollGameState]);

  const subscribeEvents = useCallback((_contract: ethers.Contract, myTeam: TeamId) => {
    // Store the team in ref so interval can access it
    pollEventsRef.current = myTeam;
  }, []);

  // ── Mount: load saved nickname ─────────────────────────────────────────
  // (nickname is pre-loaded via useState initializer above, no useEffect needed)

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (sabTimerRef.current) clearTimeout(sabTimerRef.current);
    };
  }, []);

  // ── handleNext: create wallet, fund, auto-join ──────────────────────────────

  const handleNext = useCallback(async () => {
    const nick = nickname.trim() || 'anon' + Math.floor(Math.random() * 9999);
    setNickname(nick);
    localStorage.setItem('tugmon_nickname', nick);

    // 1. Create deterministic burner wallet
    const wallet = getOrCreateBurnerWallet(nick);
    burnerWalletRef.current = wallet;
    setBurnerAddress(wallet.address);

    const provider = getProvider();
    const contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      CONTRACT_ABI,
      new ethers.NonceManager(wallet.connect(provider))
    );
    arenaContractRef.current = contract;

    setPhase('funding');

    // 2. Check if player already joined (resume session)
    try {
      const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const pInfo = await readContract.getPlayerInfo(wallet.address);
      const storedTeam = Number(pInfo[0]);
      const storedRole = Number(pInfo[1]);

      const gInfo = await readContract.getGameInfo();
      const nowSec = BigInt(Math.floor(Date.now() / 1000));

      setGame({
        redScore: Number(gInfo[0]),
        blueScore: Number(gInfo[1]),
        lastReset: Number(gInfo[2]),
        redBoosted: BigInt(gInfo[4]) > nowSec,
        blueBoosted: BigInt(gInfo[5]) > nowSec,
        redSabotaged: BigInt(gInfo[6]) > nowSec,
        blueSabotaged: BigInt(gInfo[7]) > nowSec,
      });

      // ── Always ensure wallet is funded (resume OR new join) ──────────────────
      showStatus('Checking wallet…', 'pending');
      // Check balance first before deciding to fund
      const currentBal = await provider.getBalance(wallet.address);
      const MIN_BAL = ethers.parseEther('0.10');

      if (currentBal < MIN_BAL) {
        showStatus('Funding wallet (one-time)…', 'pending');
        const fundResult = await fundBurnerWallet(wallet.address);

        if (fundResult.rateLimited) {
          // Rate limited AND wallet is empty — this shouldn't happen but handle gracefully
          showStatus('❌ Wallet empty and rate limited. Try again shortly.', 'err', 6000);
          setPhase('nickname');
          return;
        }

        if (!fundResult.success && !fundResult.alreadyFunded) {
          showStatus(`❌ ${fundResult.error || 'Funding failed'}`, 'err', 5000);
          setPhase('nickname');
          return;
        }

        // Poll on-chain balance until confirmed (up to 20 seconds)
        showStatus('Waiting for balance…', 'pending');
        const funded = await waitForBalance(wallet.address, '0.08', 20000);
        if (!funded) {
          showStatus('❌ Balance not confirmed. Try again.', 'err', 5000);
          setPhase('nickname');
          return;
        }
      }

      if (storedTeam !== 0) {
        // Already joined — resume with funded wallet
        const t = storedTeam as TeamId;
        setTeam(t);
        setRoleId(storedRole as RoleId);
        subscribeEvents(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider), t);
        pollRef.current = setInterval(async () => {
          await Promise.all([pollGameState(), pollEventsRef.current ? pollLogs(pollEventsRef.current) : Promise.resolve()]);
        }, POLL_INTERVAL_MS);
        setPhase('playing');
        void refreshBalance();
        return;
      }

      // 3. Determine team by score balance (join less-populated team)
      const rScore = Number(gInfo[0]);
      const bScore = Number(gInfo[1]);
      const assignedTeam: TeamId =
        rScore > bScore ? 2 // blue team needs more players
        : bScore > rScore ? 1 // red team needs more players
        : Math.random() < 0.5 ? 1 : 2; // tie → random

      // 6. Join the arena
      setPhase('joining');
      showStatus('Joining arena…', 'pending');

      try {
        const tx = await contract.join(assignedTeam, nick);
        await tx.wait(1);
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : String(e);
        // If "already joined" revert, just continue
        if (!raw.includes('already') && !raw.includes('AlreadyJoined')) {
          showStatus(`❌ ${raw.slice(0, 60)}`, 'err', 5000);
          setPhase('nickname');
          return;
        }
      }

      // 7. Read role assigned by contract
      const pInfo2 = await readContract.getPlayerInfo(wallet.address);
      const finalRole = Number(pInfo2[1]) as RoleId;

      setTeam(assignedTeam);
      setRoleId(finalRole);
      showStatus('✅ You are in!', 'ok', 1500);

      // 8. Start event subscription + polling
      subscribeEvents(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider), assignedTeam);
      pollRef.current = setInterval(async () => {
        await Promise.all([pollGameState(), pollEventsRef.current ? pollLogs(pollEventsRef.current) : Promise.resolve()]);
      }, POLL_INTERVAL_MS);

      setPhase('playing');
      void refreshBalance();

    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      showStatus(`❌ Connection error: ${raw.slice(0, 60)}`, 'err', 5000);
      setPhase('nickname');
    }
  }, [nickname, getProvider, subscribeEvents, pollGameState, pollLogs, refreshBalance, showStatus]);

  // ── Balance refresh while playing ──────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(refreshBalance, 10000);
    return () => clearInterval(id);
  }, [phase, refreshBalance]);

  // ── handlePump (pull action) ────────────────────────────────────────────────

  const isRed = team === TEAMS.RED;
  const roleMeta = ROLE_META[roleId];
  const myTeamSabotaged = team ? (isRed ? game.redSabotaged : game.blueSabotaged) : false;

  const throttledPull = useRef(
    throttle((contract: ethers.Contract) => {
      contract.pull().catch(console.error);
    }, 450, { trailing: true })
  ).current;

  const handlePump = useCallback(() => {
    if (pumpCd || myTeamSabotaged || !arenaContractRef.current) return;
    setPumpCd(true);

    const cx = window.innerWidth / 2;
    const cy = Math.min(window.innerHeight * 0.68, window.innerHeight - 100);
    const engineerBonus = roleId === ROLE_ID.ENGINEER;
    const isBoostActive = isRed ? game.redBoosted : game.blueBoosted;
    const label = isBoostActive ? '⚡+2' : engineerBonus ? '+2' : '+1';

    const newParticles: Particle[] = Array.from({ length: 7 }, (_, i) => ({
      id: Date.now() + i,
      x: cx + (Math.random() - 0.5) * 60,
      y: cy - 20,
      drift: (Math.random() - 0.5) * 80,
      label: i < 3 ? label : i < 5 ? '🚀' : roleMeta.emoji,
    }));

    setParticles(p => [...p, ...newParticles]);
    setTimeout(() => setParticles(p => p.filter(x => !newParticles.find(n => n.id === x.id))), 900);
    if (navigator.vibrate) navigator.vibrate(50);

    throttledPull(arenaContractRef.current);
    setTimeout(() => setPumpCd(false), 450);
  }, [pumpCd, isRed, myTeamSabotaged, game.redBoosted, game.blueBoosted, roleId, roleMeta, throttledPull]);

  // ── Special actions ─────────────────────────────────────────────────────────

  const handleSabotage = useCallback(async () => {
    if (!arenaContractRef.current) return;
    showStatus('Sabotage…', 'pending');
    try {
      const tx = await arenaContractRef.current.sabotage();
      await tx.wait(1);
      showStatus('✅ Sabotage sent', 'ok', 1500);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      showStatus(`❌ ${raw.slice(0, 50)}`, 'err', 3000);
    }
  }, [showStatus]);

  const handleBoost = useCallback(async () => {
    if (!arenaContractRef.current) return;
    showStatus('Boost…', 'pending');
    try {
      const tx = await arenaContractRef.current.boost();
      await tx.wait(1);
      showStatus('✅ Boost active', 'ok', 1500);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      showStatus(`❌ ${raw.slice(0, 50)}`, 'err', 3000);
    }
  }, [showStatus]);

  // ── Round over winner ───────────────────────────────────────────────────────

  const winnerLabel =
    game.redScore > game.blueScore
      ? 'Red Team'
      : game.blueScore > game.redScore
        ? 'Blue Team'
        : 'Tie';
  const winnerIsRed = game.redScore > game.blueScore;
  const winnerIsBlue = game.blueScore > game.redScore;

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        'relative flex min-h-0 flex-1 flex-col font-sans select-none',
        'bg-gradient-to-b',
        phase === 'playing' && team ? teamGrad[team] : 'from-[#0a0a12] to-[#040408]',
      ].join(' ')}
    >
      {/* ── Wallet badge ── */}
      {burnerAddress && (
        <div className="absolute right-3 top-3 z-50 sm:right-6 sm:top-4">
          <div className="rounded-full border border-white/[0.12] bg-black/55 px-3 py-1.5 font-mono text-[10px] text-white/65 shadow-lg shadow-black/40 backdrop-blur-md">
            <span className="text-white/90">{balance}</span>{' '}
            <span className="text-white/35">MON</span>
            <span className="mx-1.5 text-white/20">·</span>
            <span className="text-white/50">{burnerAddress.slice(0, 6)}…{burnerAddress.slice(-4)}</span>
          </div>
        </div>
      )}

      {/* ── Floating particles ── */}
      <AnimatePresence>
        {particles.map(p => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, y: 0, x: 0 }}
            animate={{ opacity: 0, y: -120, x: p.drift }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.85, ease: 'easeOut' }}
            className="fixed pointer-events-none z-50 font-black text-2xl text-white"
            style={{ left: p.x, top: p.y }}
          >
            {p.label}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── Sabotage alert overlay ── */}
      <AnimatePresence>
        {showSabAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center pointer-events-none bg-red-500/15"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              className="text-center px-8"
            >
              <div className="text-8xl mb-6">💣</div>
              <div
                className="text-4xl font-black tracking-widest text-white animate-glitch"
                style={{ textShadow: '0 0 20px rgba(239,68,68,1)' }}
              >
                YOU&apos;RE SABOTAGED
              </div>
              <div className="mt-4 text-xl font-black text-red-200">PULL DISABLED</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ── */}
      <div
        className={[
          'mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-10 pt-14 sm:px-6',
          phase === 'playing' ? 'max-w-2xl' : '',
        ].join(' ')}
      >
        {/* ── NICKNAME PHASE ── */}
        {phase === 'nickname' && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-1 flex-col justify-center gap-8"
          >
            <div className="text-center">
              <h1 className="mb-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Join the arena</h1>
              <p className="text-sm text-white/45">Pick a display name. No wallet signature required.</p>
            </div>

            <div className="space-y-4">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                Display name
              </label>
              <input
                type="text"
                maxLength={16}
                autoFocus
                placeholder="Optional — random if empty"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleNext()}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-center text-lg font-medium text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/15"
              />
              <button
                type="button"
                onClick={() => void handleNext()}
                className="w-full rounded-xl bg-white py-3.5 text-sm font-semibold text-[#040408] transition hover:bg-white/90 active:scale-[0.99]"
              >
                Continue
              </button>
            </div>

            <p className="text-center text-xs leading-relaxed text-white/35">
              A temporary session wallet is created for this app. Funds may be topped up automatically on testnet.
            </p>
            {getBurnerWalletMode() === 'deterministic' ? (
              <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-center text-[11px] leading-relaxed text-amber-100/85">
                <span className="font-semibold text-amber-200/95">Note: </span>
                The same display name always derives the same wallet address on any device—anyone choosing that name shares that session. Pick a unique name for demos.
              </p>
            ) : (
              <p className="rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-4 py-3 text-center text-[11px] leading-relaxed text-sky-100/85">
                <span className="font-semibold text-sky-200/95">Note: </span>
                Your wallet is stored only in this browser (localStorage). Clearing site data creates a new address; your display name is separate from the key.
              </p>
            )}
          </motion.div>
        )}

        {/* ── FUNDING / JOINING PHASE ── */}
        {(phase === 'funding' || phase === 'joining') && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-t-white/80 border-r-transparent border-b-white/20 border-l-transparent" />
            <div className="text-lg font-medium text-white/90">
              {phase === 'funding' ? 'Preparing wallet…' : 'Joining team…'}
            </div>
            {txStatus && (
              <div className={`text-sm font-bold max-w-sm text-center px-4 py-2 rounded-xl border ${
                txStatus.type === 'err'
                  ? 'bg-red-900/30 border-red-500/40 text-red-300'
                  : txStatus.type === 'ok'
                  ? 'bg-green-900/30 border-green-500/40 text-green-300'
                  : 'bg-white/5 border-white/10 text-gray-400'
              }`}>
                {txStatus.msg}
              </div>
            )}
            {burnerAddress && (
              <div className="text-xs text-gray-600 font-mono">
                Burner: {burnerAddress.slice(0, 10)}…{burnerAddress.slice(-6)}
              </div>
            )}
          </div>
        )}

        {/* ── ROUND OVER PHASE ── */}
        {phase === 'round_over' && (
          <div className="mt-8 flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-5xl">
              🏁
            </motion.div>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Round over</h2>
            <div className="mt-2 text-lg text-white/80">
              Winner:{' '}
              <span
                className={
                  winnerIsRed ? 'text-red-400' : winnerIsBlue ? 'text-blue-400' : 'text-white/50'
                }
              >
                {winnerLabel}
              </span>
            </div>
            <p className="mt-2 text-sm text-white/40">Next round starting…</p>
          </div>
        )}

        {/* ── PLAYING PHASE ── */}
        {phase === 'playing' && team && (
          <div className="flex w-full flex-1 flex-col justify-center gap-3 pb-6 pt-2 sm:gap-5">
            <div className="flex justify-center px-2">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-3.5 py-2 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur-md sm:px-4">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                </span>
                <span className="font-orbitron text-[10px] font-bold uppercase tracking-[0.22em] text-white/55 sm:text-[11px]">
                  Match live
                </span>
              </div>
            </div>
            <CanvasGame
              game={game}
              team={team}
              roleId={roleId}
              eventCount={eventCount}
              onPull={handlePump}
              onSabotage={() => void handleSabotage()}
              onBoost={() => void handleBoost()}
              txStatus={txStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page Export ─────────────────────────────────────────────────────

// Use React.lazy + Suspense to defer rendering until client-side mount,
// avoiding the setState-in-effect lint error pattern entirely.
export default function TugmonPage() {
  return <GameSession />;
}
