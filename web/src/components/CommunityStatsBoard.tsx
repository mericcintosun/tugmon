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
        if (!res.ok) {
          if (!cancelled) setErr(`Stats unavailable (${res.status})`);
          return;
        }
        const data = (await res.json()) as { totals?: Totals; source?: string };
        if (!cancelled && data.totals) setTotals(data.totals);
      } catch {
        if (!cancelled) setErr("Could not load stats");
      }
    })();
    const id = setInterval(() => {
      void fetch("/api/community-stats", { cache: "no-store" })
        .then((r) => {
          if (!r.ok) return null;
          return r.json();
        })
        .then((data: { totals?: Totals } | null) => {
          if (data?.totals) setTotals(data.totals);
        })
        .catch(() => {});
    }, 22000);
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
    return <p className="text-sm text-on-surface-variant">{err}</p>;
  }

  return (
    <div className={variant === "compact" ? "space-y-3" : "space-y-5"}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.28em] text-tertiary/90">
            Social pressure
          </p>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            Pull counts from contract <span className="text-tertiary">Pulled</span> logs, grouped by each
            wallet&apos;s on-chain <span className="text-tertiary">playerCommunity</span> mapping.
          </p>
        </div>
        {showShare && (
          <a
            href={shareHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-dashed border-outline-variant bg-surface-container-high px-4 py-2 text-xs font-headline font-semibold text-on-surface transition hover:border-primary hover:text-primary"
          >
            Share on X
          </a>
        )}
      </div>

      {totalAll > 0 && (
        <p className="text-xs text-on-surface-variant">
          Combined testnet pulls tracked:{" "}
          <span className="font-label font-bold text-on-surface">{totalAll.toLocaleString()}</span>
        </p>
      )}

      <ul className="space-y-2.5">
        {sorted.map((c) => {
          const n = totals?.[c.id] ?? 0;
          const pct = totalAll > 0 ? Math.round((n / totalAll) * 100) : 0;
          return (
            <li key={c.id} className="overflow-hidden rounded-sm bg-surface-container-highest stitched-border">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="flex items-center gap-2 font-headline text-sm font-semibold text-on-surface">
                  <span>{c.emoji}</span>
                  {c.name}
                </span>
                <span className="font-label text-sm tabular-nums text-tertiary">{n.toLocaleString()}</span>
              </div>
              <div className="h-1.5 bg-outline-variant/40">
                <div
                  className="h-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-500"
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
