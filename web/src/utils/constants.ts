// ── Contract Address ──────────────────────────────────────────────────────────
export const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x0000000000000000000000000000000000000000").trim();

// ── ABI ───────────────────────────────────────────────────────────────────────
export const CONTRACT_ABI = [
  // State reads
  "function redScore() view returns (uint256)",
  "function blueScore() view returns (uint256)",
  "function redBoostEndTime() view returns (uint256)",
  "function blueBoostEndTime() view returns (uint256)",
  "function redSabotageEndTime() view returns (uint256)",
  "function blueSabotageEndTime() view returns (uint256)",
  "function lastReset() view returns (uint256)",
  "function GAME_DURATION() view returns (uint256)",
  "function PULL_COOLDOWN() view returns (uint256)",
  "function SPECIAL_COOLDOWN() view returns (uint256)",
  "function playerTeam(address) view returns (uint8)",
  "function playerRole(address) view returns (uint8)",
  "function playerCommunity(address) view returns (uint8)",

  // Batch views
  "function getGameInfo() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
  "function getPlayerInfo(address) view returns (uint8,uint8,uint8,uint256,uint256)",

  // Actions
  "function join(uint8 team, uint8 communityId, string calldata nickname) external",
  "function pull() external",
  "function pullMany(uint8 n) external",
  "function boost() external",
  "function sabotage() external",
  "function resetGame() external",

  // Events  (team: 1=Red, 2=Blue)
  "event PlayerJoined(address indexed player, uint8 team, uint8 communityId, uint8 role, string nickname)",
  "event Pulled(address indexed player, uint8 team, uint256 redScore, uint256 blueScore)",
  "event Boosted(address indexed player, uint8 team, uint256 endTime)",
  "event Sabotaged(address indexed player, uint8 targetTeam, uint256 endTime)",
  "event GameReset(uint256 timestamp)",
];

// ── Team helpers ──────────────────────────────────────────────────────────────
// On-chain: 0 = not joined, 1 = Red, 2 = Blue
export const TEAMS = {
  RED:  1 as const,
  BLUE: 2 as const,
};
export type TeamId = 1 | 2;

// ── Role helpers ──────────────────────────────────────────────────────────────
// On-chain enum: 0=NONE, 1=ENGINEER, 2=SABOTEUR, 3=BOOSTER
export const ROLE_ID = {
  NONE:     0,
  ENGINEER: 1,
  SABOTEUR: 2,
  BOOSTER:  3,
} as const;
export type RoleId = 0 | 1 | 2 | 3;

export const ROLE_NAMES: Record<RoleId, string> = {
  0: 'none',
  1: 'engineer',
  2: 'saboteur',
  3: 'booster',
};

export const ROLE_META: Record<RoleId, { emoji: string; label: string; description: string; color: string }> = {
  0: { emoji: '?',   label: 'Unknown',   description: '',                           color: 'gray' },
  1: { emoji: '🛠️', label: 'Engineer',   description: '2× Pull Power — Build fast!',  color: 'sky' },
  2: { emoji: '💣',  label: 'Saboteur',   description: 'Freeze enemy team for 3s',   color: 'red' },
  3: { emoji: '⚡',  label: 'Booster',    description: '2× Nitro for your team 5s',   color: 'yellow' },
};
