'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import {
  GMONAD_COMMUNITIES,
  COMMUNITY_ON_CHAIN_ID,
  communityIdFromOnChain,
  getCommunity,
  isCommunityId,
  type CommunityId,
} from '@/utils/gmonadCommunities';
import { getRaidMultiplierForTeam, getRaidBoostedTeam, formatRaidHint } from '@/utils/raidSchedule';
import { computePullBurstCount, getNftStrengthMultiplier } from '@/utils/pullBurst';
import { hasCommunityNftWithProvider } from '@/lib/nftPowerUp';
import {
  connectBrowserWallet,
  disconnectStoredMainWallet,
  getEthereum,
  getStoredMainWallet,
} from '@/lib/mainWallet';
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
  1: "from-red-950/90 via-red-950/40 to-background",
  2: "from-blue-950/90 via-blue-950/40 to-background",
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
  /** Explicit rope side — must match join() uint8 (fixes wrong-team bugs). */
  const [selectedChainTeam, setSelectedChainTeam] = useState<TeamId | null>(null);
  /** Crew / stats / NFT collection (independent of RED vs BLUE). */
  const [selectedCommunity, setSelectedCommunity] = useState<CommunityId | null>(null);
  /** Persisted while in-match for Gmonad HUD + stats. */
  const [joinedCommunityId, setJoinedCommunityId] = useState<CommunityId | null>(null);
  const [mainWallet, setMainWallet] = useState<string | null>(null);
  const [nftHoldVerified, setNftHoldVerified] = useState(false);
  const [raidNow, setRaidNow] = useState(0);
  const [checkingNft, setCheckingNft] = useState(false);
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

  // ── Main wallet (optional NFT buff) ────────────────────────────────────────

  useEffect(() => {
    setMainWallet(getStoredMainWallet());
  }, []);

  useEffect(() => {
    const id = setInterval(() => setRaidNow(n => n + 1), 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase !== 'playing' || !joinedCommunityId || !mainWallet) {
      setNftHoldVerified(false);
      return;
    }
    const eth = getEthereum();
    if (!eth) return;
    let cancelled = false;
    setCheckingNft(true);
    void (async () => {
      const ok = await hasCommunityNftWithProvider(mainWallet, joinedCommunityId, eth);
      if (!cancelled) {
        setNftHoldVerified(ok);
        setCheckingNft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, joinedCommunityId, mainWallet]);

  // ── handleNext: create wallet, fund, auto-join ──────────────────────────────

  const handleNext = useCallback(async () => {
    if (!selectedChainTeam || !selectedCommunity) {
      showStatus('Pick RED or BLUE, then your crew', 'err', 2500);
      return;
    }
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
      const storedCommunityOnChain = Number(pInfo[2]);

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
        // Already joined — trust on-chain team + community (not stale localStorage)
        const t = storedTeam as TeamId;
        setTeam(t);
        setRoleId(storedRole as RoleId);
        const fromChain = communityIdFromOnChain(storedCommunityOnChain);
        if (fromChain) {
          setJoinedCommunityId(fromChain);
          localStorage.setItem('tugmon_community', fromChain);
          localStorage.setItem('tugmon_chain_team', String(t));
        } else {
          const savedC = typeof window !== 'undefined' ? localStorage.getItem('tugmon_community') : null;
          if (savedC && isCommunityId(savedC)) setJoinedCommunityId(savedC);
        }
        subscribeEvents(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider), t);
        pollRef.current = setInterval(async () => {
          await Promise.all([pollGameState(), pollEventsRef.current ? pollLogs(pollEventsRef.current) : Promise.resolve()]);
        }, POLL_INTERVAL_MS);
        setPhase('playing');
        void refreshBalance();
        return;
      }

      const comm = getCommunity(selectedCommunity);
      if (!comm) {
        showStatus('Invalid crew', 'err', 2500);
        setPhase('nickname');
        return;
      }
      const communityOnChain = COMMUNITY_ON_CHAIN_ID[selectedCommunity];
      const assignedTeam = selectedChainTeam;

      // 6. Join the arena — team and community are independent on-chain
      setPhase('joining');
      showStatus('Joining arena…', 'pending');

      try {
        const tx = await contract.join(assignedTeam, communityOnChain, nick);
        await tx.wait(1);
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : String(e);
        if (!raw.includes('already') && !raw.includes('AlreadyJoined')) {
          showStatus(`❌ ${raw.slice(0, 60)}`, 'err', 5000);
          setPhase('nickname');
          return;
        }
      }

      const pInfo2 = await readContract.getPlayerInfo(wallet.address);
      const onChainTeam = Number(pInfo2[0]) as TeamId;
      const finalRole = Number(pInfo2[1]) as RoleId;
      const onChainCommunity = Number(pInfo2[2]);

      if (onChainTeam !== assignedTeam) {
        showStatus('❌ On-chain team mismatch — wrong contract ABI?', 'err', 6000);
        setPhase('nickname');
        return;
      }
      if (onChainCommunity !== communityOnChain) {
        showStatus('❌ Community id mismatch on-chain', 'err', 6000);
        setPhase('nickname');
        return;
      }

      setTeam(onChainTeam);
      setRoleId(finalRole);
      setJoinedCommunityId(selectedCommunity);
      localStorage.setItem('tugmon_community', selectedCommunity);
      localStorage.setItem('tugmon_chain_team', String(onChainTeam));
      showStatus('✅ You are in!', 'ok', 1500);

      // 8. Start event subscription + polling
      subscribeEvents(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider), onChainTeam);
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
  }, [nickname, selectedChainTeam, selectedCommunity, getProvider, subscribeEvents, pollGameState, pollLogs, refreshBalance, showStatus]);

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

  const reportCommunityPulls = useCallback((n: number) => {
    if (!joinedCommunityId || n <= 0) return;
    void fetch('/api/community-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId: joinedCommunityId, txCount: n }),
    }).catch(() => {});
  }, [joinedCommunityId]);

  const pumpBurstLock = useRef(false);

  const handlePump = useCallback(() => {
    if (pumpBurstLock.current || pumpCd || myTeamSabotaged || !arenaContractRef.current || !team) return;

    const nftMult = getNftStrengthMultiplier(nftHoldVerified);
    const raidMult = getRaidMultiplierForTeam(team);
    const burst = computePullBurstCount(nftMult, raidMult);

    pumpBurstLock.current = true;
    setPumpCd(true);

    const cx = window.innerWidth / 2;
    const cy = Math.min(window.innerHeight * 0.68, window.innerHeight - 100);
    const engineerBonus = roleId === ROLE_ID.ENGINEER;
    const isBoostActive = isRed ? game.redBoosted : game.blueBoosted;
    const baseLabel = isBoostActive ? '⚡+2' : engineerBonus ? '+2' : '+1';
    const label = burst > 1 ? `${baseLabel} ×${burst}` : baseLabel;

    const newParticles: Particle[] = Array.from({ length: 7 }, (_, i) => ({
      id: Date.now() + i,
      x: cx + (Math.random() - 0.5) * 60,
      y: cy - 20,
      drift: (Math.random() - 0.5) * 80,
      label: i < 3 ? label : i < 5 ? '🚀' : roleMeta.emoji,
    }));

    setParticles(p => [...p, ...newParticles]);
    setTimeout(() => setParticles(p => p.filter(x => !newParticles.find(n => n.id === x.id))), 900);
    if (navigator.vibrate) navigator.vibrate(burst > 1 ? [40, 30, 40] : 50);

    const c = arenaContractRef.current;
    void (async () => {
      try {
        const contractAny = c as ethers.Contract & { pullMany: (n: number) => Promise<ethers.ContractTransactionResponse> };
        await contractAny.pullMany(burst).then((tx) => tx.wait(1));
        reportCommunityPulls(burst);
      } catch (e) {
        console.error(e);
        try {
          for (let i = 0; i < burst; i++) await c.pull();
          reportCommunityPulls(burst);
        } catch (e2) {
          console.error(e2);
        }
      } finally {
        pumpBurstLock.current = false;
      }
    })();

    setTimeout(() => setPumpCd(false), Math.min(1800, 420 + burst * 140));
  }, [
    pumpCd,
    myTeamSabotaged,
    team,
    isRed,
    game.redBoosted,
    game.blueBoosted,
    roleId,
    roleMeta,
    nftHoldVerified,
    reportCommunityPulls,
  ]);

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

  const gmonadHud = useMemo(() => {
    void raidNow;
    const joinedMeta = joinedCommunityId ? getCommunity(joinedCommunityId) : null;
    const nftMult = getNftStrengthMultiplier(nftHoldVerified);
    const raidMult = team ? getRaidMultiplierForTeam(team) : 1;
    const burstPreview = computePullBurstCount(nftMult, raidMult);
    const raidBoostedSide = getRaidBoostedTeam();
    const raidActive = !!(team && raidBoostedSide === team);
    const allegianceLine =
      joinedMeta && team
        ? `${joinedMeta.emoji} ${joinedMeta.name} — fighting for ${team === TEAMS.RED ? 'RED' : 'BLUE'} on-chain`
        : null;
    const powerLine = team
      ? [
          checkingNft
            ? 'Verifying NFT…'
            : nftHoldVerified
              ? `NFT-linked · ${nftMult}× · pullMany(${burstPreview}) — one tx`
              : `NFT 1× · connect + NEXT_PUBLIC_NFT_* · pullMany(${burstPreview})`,
          raidActive ? 'COMMUNITY RAID 2× WINDOW' : `Raids ${formatRaidHint()} (2× when your side is blessed)`,
        ].join(' · ')
      : null;
    return { allegianceLine, powerLine };
  }, [raidNow, joinedCommunityId, team, nftHoldVerified, checkingNft]);

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        'relative flex min-h-0 flex-1 flex-col font-sans select-none',
        'bg-gradient-to-b',
        phase === "playing" && team ? teamGrad[team] : "from-surface-container-low to-background",
      ].join(' ')}
    >
      {/* ── Wallet badge ── */}
      {burnerAddress && (
        <div className="absolute right-3 top-3 z-50 sm:right-6 sm:top-4">
          <div className="glass-panel rounded-full border border-dashed border-outline-variant px-3 py-1.5 font-mono text-[10px] text-on-surface-variant shadow-patch">
            <span className="text-on-surface">{balance}</span>{" "}
            <span className="text-outline">MON</span>
            <span className="mx-1.5 text-outline/60">·</span>
            <span className="text-on-surface-variant">{burnerAddress.slice(0, 6)}…{burnerAddress.slice(-4)}</span>
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
            className="fixed pointer-events-none z-50 font-headline text-2xl font-black text-on-surface"
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
              <p className="mb-2 font-label text-[10px] font-bold uppercase tracking-[0.35em] text-tertiary">
                The Gmonad War
              </p>
              <h1 className="mb-2 font-headline text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">
                Community Tug
              </h1>
              <p className="font-body text-sm text-on-surface-variant">
                Pledge to a Monad crew. Your burner pulls for the rope; link main wallet for NFT power.
              </p>
            </div>

            <div className="space-y-4">
              <label className="block font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-outline">
                Display name
              </label>
              <input
                type="text"
                maxLength={16}
                autoFocus
                placeholder="Optional — random if empty"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                onKeyDown={e =>
                  e.key === 'Enter' && selectedCommunity && selectedChainTeam && void handleNext()
                }
                className="input-ghost-border w-full px-4 py-3.5 text-center font-body text-lg font-medium text-on-surface placeholder:text-outline/60 focus:ring-0"
              />

              <div className="pt-1">
                <label className="mb-3 block font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-outline">
                  Rope side (on-chain)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedChainTeam(TEAMS.RED)}
                    className={[
                      "rounded-sm border-2 border-dashed px-4 py-4 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      selectedChainTeam === TEAMS.RED
                        ? "border-red-400 bg-red-950/50 shadow-[0_0_24px_rgba(239,68,68,0.25)]"
                        : "border-outline-variant bg-surface-container-high/80 hover:border-red-400/50",
                    ].join(' ')}
                  >
                    <span className="block text-2xl font-black tracking-tight text-red-400">RED</span>
                    <span className="mt-1 block font-body text-[11px] font-medium text-on-surface-variant">
                      Halat — kırmızı taraf
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedChainTeam(TEAMS.BLUE)}
                    className={[
                      "rounded-sm border-2 border-dashed px-4 py-4 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      selectedChainTeam === TEAMS.BLUE
                        ? "border-blue-400 bg-blue-950/50 shadow-[0_0_24px_rgba(59,130,246,0.25)]"
                        : "border-outline-variant bg-surface-container-high/80 hover:border-blue-400/50",
                    ].join(' ')}
                  >
                    <span className="block text-2xl font-black tracking-tight text-blue-400">BLUE</span>
                    <span className="mt-1 block font-body text-[11px] font-medium text-on-surface-variant">
                      Halat — mavi taraf
                    </span>
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <label className="mb-3 block font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-outline">
                  Crew (stats & NFT)
                </label>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {GMONAD_COMMUNITIES.map((c) => {
                    const sel = selectedCommunity === c.id;
                    const borderSel =
                      c.accent === 'purple'
                        ? 'border-violet-400 bg-violet-950/40 shadow-[0_0_22px_rgba(167,139,250,0.2)]'
                        : c.accent === 'emerald'
                          ? 'border-emerald-400 bg-emerald-950/35 shadow-[0_0_22px_rgba(52,211,153,0.18)]'
                          : c.accent === 'amber'
                            ? 'border-amber-400 bg-amber-950/30 shadow-[0_0_22px_rgba(251,191,36,0.15)]'
                            : 'border-fuchsia-400 bg-fuchsia-950/35 shadow-[0_0_22px_rgba(232,121,249,0.18)]';
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCommunity(c.id)}
                        className={[
                          "rounded-sm border-2 border-dashed px-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                          sel ? borderSel : "border-outline-variant bg-surface-container-high/70 hover:border-outline",
                        ].join(' ')}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-xl">{c.emoji}</span>
                          <span className="font-headline font-bold text-on-surface">{c.name}</span>
                        </span>
                        <span className="mt-1 block font-body text-[11px] leading-snug text-on-surface-variant">
                          {c.short}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-sm stitched-border bg-surface-container-high/50 px-4 py-3">
                <p className="mb-2 font-label text-[11px] font-semibold uppercase tracking-[0.18em] text-outline">
                  Main wallet (NFT buff)
                </p>
                <p className="mb-3 font-body text-[11px] leading-relaxed text-on-surface-variant">
                  Connect the wallet that holds your crew&apos;s NFT — pulls from your burner get multiplied (set{' '}
                  <code className="text-primary/90">NEXT_PUBLIC_NFT_*</code> in env).
                </p>
                {!mainWallet ? (
                  <button
                    type="button"
                    onClick={() => void connectBrowserWallet().then((a) => setMainWallet(a))}
                    className="w-full border border-dashed border-primary/50 bg-primary/10 py-2.5 font-headline text-sm font-semibold text-primary transition hover:bg-primary/20"
                  >
                    Connect wallet
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-on-surface">
                      {mainWallet.slice(0, 6)}…{mainWallet.slice(-4)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void disconnectStoredMainWallet();
                        setMainWallet(null);
                      }}
                      className="rounded-sm border border-dashed border-outline-variant px-3 py-1.5 font-label text-[11px] font-medium text-on-surface-variant hover:bg-surface-container-high"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={!selectedCommunity || !selectedChainTeam}
                onClick={() => void handleNext()}
                className="group relative w-full bg-gradient-to-br from-primary to-primary-container py-3.5 font-headline text-sm font-bold uppercase tracking-wide text-on-primary transition hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="absolute -inset-[2px] -z-10 border border-dashed border-secondary/50 opacity-70" />
                Continue
              </button>
            </div>

            <p className="text-center font-body text-xs leading-relaxed text-outline">
              A temporary session wallet is created for this app. Funds may be topped up automatically on testnet.
            </p>
            {getBurnerWalletMode() === "deterministic" ? (
              <p className="rounded-sm border border-dashed border-secondary/40 bg-secondary/5 px-4 py-3 text-center font-body text-[11px] leading-relaxed text-secondary-fixed">
                <span className="font-headline font-semibold text-secondary">Note: </span>
                The same display name always derives the same wallet address on any device—anyone choosing that name shares that session. Pick a unique name for demos.
              </p>
            ) : (
              <p className="rounded-sm border border-dashed border-tertiary/35 bg-tertiary/5 px-4 py-3 text-center font-body text-[11px] leading-relaxed text-tertiary">
                <span className="font-headline font-semibold text-tertiary">Note: </span>
                Your wallet is stored only in this browser (localStorage). Clearing site data creates a new address; your display name is separate from the key.
              </p>
            )}
          </motion.div>
        )}

        {/* ── FUNDING / JOINING PHASE ── */}
        {(phase === 'funding' || phase === 'joining') && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-t-primary border-r-transparent border-b-outline-variant border-l-transparent" />
            <div className="font-headline text-lg font-medium text-on-surface">
              {phase === 'funding' ? 'Preparing wallet…' : 'Joining team…'}
            </div>
            {txStatus && (
              <div
                className={`max-w-sm rounded-sm border px-4 py-2 text-center font-label text-sm font-bold ${
                  txStatus.type === "err"
                    ? "border-dashed border-error bg-error/15 text-error"
                    : txStatus.type === "ok"
                      ? "border-dashed border-tertiary bg-tertiary/10 text-tertiary"
                      : "border-dashed border-outline-variant bg-surface-container-high text-on-surface-variant"
                }`}
              >
                {txStatus.msg}
              </div>
            )}
            {burnerAddress && (
              <div className="font-mono text-xs text-outline">
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
            <h2 className="font-headline text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">
              Round over
            </h2>
            <div className="mt-2 font-body text-lg text-on-surface">
              Winner:{" "}
              <span
                className={
                  winnerIsRed ? "text-red-400" : winnerIsBlue ? "text-blue-400" : "text-on-surface-variant"
                }
              >
                {winnerLabel}
              </span>
            </div>
            <p className="mt-2 font-body text-sm text-on-surface-variant">Next round starting…</p>
          </div>
        )}

        {/* ── PLAYING PHASE ── */}
        {phase === 'playing' && team && (
          <div className="flex w-full flex-1 flex-col justify-center gap-3 pb-6 pt-2 sm:gap-5">
            <div className="flex justify-center px-2">
              <div className="glass-panel inline-flex items-center gap-2.5 rounded-full border border-dashed border-outline-variant px-3.5 py-2 shadow-patch sm:px-4">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tertiary/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-tertiary shadow-[0_0_10px_rgba(161,250,255,0.6)]" />
                </span>
                <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface-variant sm:text-[11px]">
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
              allegianceLine={gmonadHud.allegianceLine}
              powerLine={gmonadHud.powerLine}
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
