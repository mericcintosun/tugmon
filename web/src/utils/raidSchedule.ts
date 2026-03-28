import type { TeamId } from "@/utils/constants";
import { TEAMS } from "@/utils/constants";

/**
 * Community Raid windows (UTC): synchronized "2× event" hours for stress-test demos.
 * Override with NEXT_PUBLIC_RAID_START_UTC_HOUR / END or disable with NEXT_PUBLIC_RAIDS_ENABLED=0.
 */

function raidsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RAIDS_ENABLED !== "0";
}

function parseHour(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(23, n)) : fallback;
}

function parseMin(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(59, n)) : fallback;
}

/** Default: 17:00–17:30 UTC daily — tweak for your demo / Discord "raid" call. */
export function getRaidWindowUtc(): { startHour: number; startMin: number; endHour: number; endMin: number } {
  return {
    startHour: parseHour("NEXT_PUBLIC_RAID_START_UTC_HOUR", 17),
    startMin: parseMin("NEXT_PUBLIC_RAID_START_UTC_MIN", 0),
    endHour: parseHour("NEXT_PUBLIC_RAID_END_UTC_HOUR", 17),
    endMin: parseMin("NEXT_PUBLIC_RAID_END_UTC_MIN", 30),
  };
}

function minutesSinceMidnightUtc(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function windowStartEndMinutes(w: ReturnType<typeof getRaidWindowUtc>): { start: number; end: number } {
  const start = w.startHour * 60 + w.startMin;
  const end = w.endHour * 60 + w.endMin;
  return { start, end };
}

/** Which chain team gets the global raid multiplier right now (0 = no raid). */
export function getRaidBoostedTeam(now: Date = new Date()): 0 | TeamId {
  if (!raidsEnabled()) return 0;
  const w = getRaidWindowUtc();
  const { start, end } = windowStartEndMinutes(w);
  const m = minutesSinceMidnightUtc(now);

  let inWindow: boolean;
  if (end > start) {
    inWindow = m >= start && m < end;
  } else if (end < start) {
    // overnight e.g. 22:00 → 02:00
    inWindow = m >= start || m < end;
  } else {
    inWindow = false;
  }

  if (!inWindow) return 0;

  const teamRaw = process.env.NEXT_PUBLIC_RAID_TEAM || "alternate";
  if (teamRaw === "red") return TEAMS.RED;
  if (teamRaw === "blue") return TEAMS.BLUE;
  // alternate by calendar day: even UTC day → red, odd → blue
  const day = now.getUTCDate();
  return day % 2 === 0 ? TEAMS.RED : TEAMS.BLUE;
}

/**
 * Multiplier applied to pull burst count during raid (matches Red or Blue side).
 * Returns 2 when your team matches the boosted side during the raid window.
 */
export function getRaidMultiplierForTeam(team: TeamId, now?: Date): number {
  const boosted = getRaidBoostedTeam(now ?? new Date());
  if (boosted === 0) return 1;
  return team === boosted ? 2 : 1;
}

export function formatRaidHint(): string {
  const w = getRaidWindowUtc();
  const sh = String(w.startHour).padStart(2, "0");
  const sm = String(w.startMin).padStart(2, "0");
  const eh = String(w.endHour).padStart(2, "0");
  const em = String(w.endMin).padStart(2, "0");
  return `${sh}:${sm}–${eh}:${em} UTC`;
}
