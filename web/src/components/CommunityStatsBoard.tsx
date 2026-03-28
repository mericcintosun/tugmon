"use client";

import React, { useEffect, useState } from "react";
import { GMONAD_COMMUNITIES, type CommunityId } from "@/utils/gmonadCommunities";

type Totals = Record<CommunityId, number>;

export function CommunityStatsBoard({
  variant = "full",
  showShare = true,
}: {
  variant?: "full" | "compact";
  showShare?: boolean;
}) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/community-stats", { cache: "no-store" });
        const data = (await res.json()) as { totals?: Totals };
        if (!cancelled && data.totals) setTotals(data.totals);
      } catch (e) {
        if (!cancelled) setErr("Could not load stats");
      }
    })();
    const id = setInterval(() => {
      void fetch("/api/community-stats", { cache: "no-store" })
        .then((r) => r.json())
        .then((data: { totals?: Totals }) => {
          if (data.totals) setTotals(data.totals);
        })
        .catch(() => {});
    }, 12000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const totalAll = totals
    ? GMONAD_COMMUNITIES.reduce((s, c) => s + (totals[c.id] ?? 0), 0)
    : 0;
  const sorted = totals
    ? [...GMONAD_COMMUNITIES].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0))
    : [];

  const top = sorted[0];
  const second = sorted[1];
  const shareText =
    top && totals
      ? `The Gmonad War on @monad: ${top.name} just flexed ${(totals[top.id] ?? 0).toLocaleString()} on-chain pulls — ${second ? `${second.name} at ${(totals[second.id] ?? 0).toLocaleString()}` : ""} #Gmonad #MonadTestnet`
      : "The Gmonad War — pull for your Monad crew on-chain. #Gmonad #MonadTestnet";

  const shareHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  if (err && !totals) {
    return <p className="text-sm text-white/40">{err}</p>;
  }

  return (
    <div className={variant === "compact" ? "space-y-3" : "space-y-5"}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-orbitron text-[10px] font-bold uppercase tracking-[0.28em] text-violet-300/75">
            Social pressure
          </p>
          <p className="mt-1 text-sm text-white/55">
            Pull txs attributed to each allegiance (reported from /play).
          </p>
        </div>
        {showShare && (
          <a
            href={shareHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/10"
          >
            Share on X
          </a>
        )}
      </div>

      {totalAll > 0 && (
        <p className="text-xs text-white/40">
          Combined testnet pulls tracked:{" "}
          <span className="font-orbitron font-bold text-white/70">{totalAll.toLocaleString()}</span>
        </p>
      )}

      <ul className="space-y-2.5">
        {sorted.map((c) => {
          const n = totals?.[c.id] ?? 0;
          const pct = totalAll > 0 ? Math.round((n / totalAll) * 100) : 0;
          return (
            <li key={c.id} className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/30">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-white/90">
                  <span>{c.emoji}</span>
                  {c.name}
                </span>
                <span className="font-orbitron text-sm tabular-nums text-white/75">{n.toLocaleString()}</span>
              </div>
              <div className="h-1.5 bg-white/[0.06]">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
