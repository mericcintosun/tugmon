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
import { getOrCreateBurnerWallet, fundBurnerWallet, waitForBalance } from '@/lib/burnerWallet';

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
      showStatus('Cüzdan kontrol ediliyor...', 'pending');
      // Check balance first before deciding to fund
      const currentBal = await provider.getBalance(wallet.address);
      const MIN_BAL = ethers.parseEther('0.10');

      if (currentBal < MIN_BAL) {
        showStatus('Cüzdan fonlanıyor... (1 kerelik)', 'pending');
        const fundResult = await fundBurnerWallet(wallet.address);

        if (fundResult.rateLimited) {
          // Rate limited AND wallet is empty — this shouldn't happen but handle gracefully
          showStatus('❌ Cüzdan boş ve rate limit aktif. Biraz bekleyin.', 'err', 6000);
          setPhase('nickname');
          return;
        }

        if (!fundResult.success && !fundResult.alreadyFunded) {
          showStatus(`❌ ${fundResult.error || 'Fonlama başarısız'}`, 'err', 5000);
          setPhase('nickname');
          return;
        }

        // Poll on-chain balance until confirmed (up to 20 seconds)
        showStatus('Bakiye bekleniyor...', 'pending');
        const funded = await waitForBalance(wallet.address, '0.08', 20000);
        if (!funded) {
          showStatus('❌ Bakiye onaylanamadı. Tekrar deneyin.', 'err', 5000);
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
      showStatus("Arena'ya katılınıyor...", 'pending');

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
      showStatus('✅ Oyuna girdin!', 'ok', 1500);

      // 8. Start event subscription + polling
      subscribeEvents(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider), assignedTeam);
      pollRef.current = setInterval(async () => {
        await Promise.all([pollGameState(), pollEventsRef.current ? pollLogs(pollEventsRef.current) : Promise.resolve()]);
      }, POLL_INTERVAL_MS);

      setPhase('playing');
      void refreshBalance();

    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      showStatus(`❌ Bağlantı hatası: ${raw.slice(0, 60)}`, 'err', 5000);
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
    const cy = window.innerHeight - 60;
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
    showStatus('Sabotaj!', 'pending');
    try {
      const tx = await arenaContractRef.current.sabotage();
      await tx.wait(1);
      showStatus('✅ Sabotaj gönderildi!', 'ok', 1500);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      showStatus(`❌ ${raw.slice(0, 50)}`, 'err', 3000);
    }
  }, [showStatus]);

  const handleBoost = useCallback(async () => {
    if (!arenaContractRef.current) return;
    showStatus('Nitro!', 'pending');
    try {
      const tx = await arenaContractRef.current.boost();
      await tx.wait(1);
      showStatus('✅ Nitro aktif!', 'ok', 1500);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      showStatus(`❌ ${raw.slice(0, 50)}`, 'err', 3000);
    }
  }, [showStatus]);

  // ── Round over winner ───────────────────────────────────────────────────────

  const winner =
    game.redScore > game.blueScore
      ? '🔴 Kırmızı Takım'
      : game.blueScore > game.redScore
      ? '🔵 Mavi Takım'
      : 'Berabere';

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        phase === 'playing' ? 'h-screen w-screen overflow-hidden' : 'min-h-screen pb-20',
        'relative select-none font-sans',
        'bg-gradient-to-b',
        phase === 'playing' && team ? teamGrad[team] : 'from-[#0a0a12] to-[#040408]',
      ].join(' ')}
    >
      {/* ── Wallet badge (top-right) ── */}
      {burnerAddress && (
        <div className="absolute top-4 right-4 z-50">
          <div className="px-3 py-1.5 bg-black/60 border border-white/10 rounded-xl text-[10px] font-mono text-gray-400 backdrop-blur">
            {balance} MON · {burnerAddress.slice(0, 6)}…{burnerAddress.slice(-4)}
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
                className="text-4xl font-black text-white tracking-widest animate-glitch"
                style={{ textShadow: '0 0 20px rgba(239,68,68,1)' }}
              >
                SABOTE EDİLDİN!
              </div>
              <div className="text-xl text-red-200 mt-4 font-black">TIKLAMALAR GEÇERSİZ!</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content area ── */}
      <div className={phase === 'playing' ? 'w-full h-screen' : 'max-w-md mx-auto min-h-screen flex flex-col px-4 pt-6'}>

        {/* ── NICKNAME PHASE ── */}
        {phase === 'nickname' && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col justify-center gap-6 mt-16"
          >
            {/* Logo */}
            <div className="text-center">
              <h1 className="text-5xl font-black italic tracking-tighter text-white mb-2">TUGMON</h1>
              <p className="text-sm text-gray-500 font-medium">Monad&apos;ın hızını hisset</p>
            </div>

            {/* Nickname input + button */}
            <div className="space-y-4">
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest">
                Savaş Alanı Rumuzun
              </label>
              <input
                type="text"
                maxLength={16}
                autoFocus
                placeholder="Rumuz gir (opsiyonel)"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleNext()}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-center text-xl font-bold text-white placeholder-gray-700 focus:outline-none focus:border-indigo-500/60 transition-all"
              />
              <button
                onClick={() => void handleNext()}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-95 rounded-2xl font-black text-lg uppercase tracking-widest shadow-[0_0_15px_rgba(79,70,229,0.5)] transition-all"
              >
                İleri →
              </button>
            </div>

            {/* Info */}
            <p className="text-center text-xs text-gray-600">
              Giriş yaparken cüzdan imzası gerekmez.<br />
              Geçici cüzdan otomatik oluşturulur.
            </p>
          </motion.div>
        )}

        {/* ── FUNDING / JOINING PHASE ── */}
        {(phase === 'funding' || phase === 'joining') && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div className="w-14 h-14 border-4 border-t-indigo-500 border-r-transparent border-b-purple-500 border-l-transparent rounded-full animate-spin" />
            <div className="text-xl font-black text-white">
              {phase === 'funding' ? 'Cüzdan hazırlanıyor...' : 'Ekibe katılınıyor...'}
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
          <div className="flex-1 flex flex-col items-center justify-center gap-6 mt-16 text-center">
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-6xl">
              🏁
            </motion.div>
            <h2 className="text-4xl font-black text-white uppercase">SÜRE DOLDU!</h2>
            <div className="text-2xl font-bold mt-4">
              Kazanan:{' '}
              <span className={winner.includes('Kırmızı') ? 'text-red-500' : 'text-blue-500'}>
                {winner}
              </span>
            </div>
            <p className="text-gray-500 mt-4">Yeni el başlıyor...</p>
          </div>
        )}

        {/* ── PLAYING PHASE ── */}
        {phase === 'playing' && team && (
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
