"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { CommunityStatsBoard } from "@/components/CommunityStatsBoard";
import SiteFooter from "@/components/SiteFooter";

const Arena = dynamic(() => import("@/components/Arena"), {
  ssr: false,
  loading: () => (
    <section className="w-full" aria-label="Arena loading">
      <div className="relative overflow-hidden rounded-sm bg-surface-container p-6 sm:p-10 md:p-12 stitched-border">
        <div className="mb-8 h-7 w-48 animate-pulse rounded-sm bg-outline-variant/25 md:mb-10" />
        <div className="relative overflow-hidden rounded-sm border border-outline-variant bg-[#0a0812]">
          <div className="min-h-[280px] w-full animate-pulse bg-[#1a1428]/80 md:min-h-[360px]" />
        </div>
        <p className="mt-4 text-center font-label text-[9px] uppercase tracking-widest text-outline/60">
          Loading arena…
        </p>
      </div>
    </section>
  ),
});

export default function LandingPage() {
  const [appUrl, setAppUrl] = useState("");
  const [chainScores, setChainScores] = useState<{ red: number; blue: number } | null>(null);

  useEffect(() => {
    const timerId = setTimeout(() => {
      const envUrl = process.env.NEXT_PUBLIC_APP_URL;
      setAppUrl(envUrl || window.location.origin);
    }, 0);
    return () => clearTimeout(timerId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/game-scores", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; redScore?: number; blueScore?: number };
        if (!cancelled && data.ok && typeof data.redScore === "number" && typeof data.blueScore === "number") {
          setChainScores({ red: data.redScore, blue: data.blueScore });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const playUrl = `${appUrl}/play`;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -15%, rgba(175, 162, 255, 0.12), transparent), radial-gradient(ellipse 55% 45% at 100% 40%, rgba(161, 250, 255, 0.06), transparent), radial-gradient(ellipse 50% 40% at 0% 85%, rgba(255, 103, 174, 0.05), transparent)",
        }}
      />

      <div className="page-shell page-stack relative z-10 flex flex-1 flex-col page-main-pad">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full"
        >
          <div className="relative overflow-hidden rounded-sm bg-surface-container-low p-8 sm:p-12 md:p-20 stitched-border">
            <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
              <div>
                <p className="mb-3 font-label text-[10px] uppercase tracking-[0.35em] text-tertiary sm:text-[11px]">
                  Monad testnet
                </p>
                <h1 className="font-headline text-4xl font-extrabold leading-[1.05] tracking-tighter text-on-surface sm:text-5xl md:text-6xl lg:text-7xl">
                  PULL <br />
                  <span className="text-primary">TOGETHER.</span>
                </h1>
                <p className="mt-6 max-w-md font-body text-base leading-relaxed text-on-surface-variant sm:text-lg">
                  <span className="font-semibold text-tertiary">The Gmonad War</span> turns the arena into a
                  social coordination experiment: pledge to a Monad crew, stress-test the chain with your
                  burner, and link your main wallet so NFTs buff your pulls.
                </p>
                <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
                  <div className="flex items-center gap-3 bg-surface-container-high px-3 py-2 sm:px-4">
                    <span className="material-symbols-outlined text-tertiary text-xl">bolt</span>
                    <span className="font-label text-[10px] uppercase tracking-widest text-on-surface sm:text-xs">
                      High-throughput pulls
                    </span>
                  </div>
                  <div className="flex items-center gap-3 bg-surface-container-high px-3 py-2 sm:px-4">
                    <span className="material-symbols-outlined text-secondary text-xl">security</span>
                    <span className="font-label text-[10px] uppercase tracking-widest text-on-surface sm:text-xs">
                      Burner + main link
                    </span>
                  </div>
                </div>
                <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap">
                  <Link
                    href="/play"
                    className="group relative inline-flex h-12 items-center justify-center bg-gradient-to-br from-primary to-primary-container px-8 text-sm font-headline font-bold uppercase tracking-wider text-on-primary transition hover:opacity-95 active:scale-[0.99] sm:min-w-[180px]"
                  >
                    <span className="absolute -inset-[2px] -z-10 border border-dashed border-secondary opacity-60 transition group-hover:stroke-[0.5]" />
                    Start playing
                  </Link>
                  <Link
                    href="/dashboard"
                    className="inline-flex h-12 items-center justify-center border border-dashed border-outline-variant bg-surface-container-high px-8 text-sm font-headline font-semibold uppercase tracking-wide text-on-surface transition hover:border-primary hover:text-primary"
                  >
                    Open live board
                  </Link>
                </div>
              </div>
              <div className="flex justify-center md:justify-end">
                <div
                  className="rotate-1 rounded-lg bg-white p-5 transition-transform duration-500 hover:rotate-0 sm:p-6"
                  style={{ boxShadow: "0 0 50px rgba(161, 250, 255, 0.2)" }}
                >
                  {appUrl ? (
                    <>
                      <QRCodeSVG
                        value={playUrl}
                        size={176}
                        bgColor="#ffffff"
                        fgColor="#2c0097"
                        level="H"
                        includeMargin={false}
                      />
                      <p className="mt-4 text-center font-label text-xs font-bold tracking-tighter text-on-primary sm:text-sm">
                        SCAN TO PLAY
                      </p>
                    </>
                  ) : (
                    <div className="flex h-44 w-44 items-center justify-center bg-surface-container-low font-label text-xs text-on-surface-variant">
                      Loading…
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Live arena / stats */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06 }}
          className="w-full"
        >
          <div className="relative overflow-hidden rounded-sm bg-surface-container p-6 sm:p-10 md:p-14 stitched-border">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="font-headline text-2xl font-bold uppercase tracking-tight text-on-surface sm:text-3xl">
                  Real-time arena
                </h2>
                <p className="mt-1 font-label text-xs text-on-surface-variant sm:text-sm">
                  ON-CHAIN: <span className="text-tertiary">Pulled</span> logs +{" "}
                  <span className="text-tertiary">getGameInfo</span>
                  {chainScores != null && (
                    <>
                      {" "}
                      · SCORE{" "}
                      <span className="text-red-400">{chainScores.red}</span>
                      {" / "}
                      <span className="text-blue-400">{chainScores.blue}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="glass-panel flex items-center gap-4 self-start rounded-sm px-4 py-3 md:self-auto">
                <span
                  className="material-symbols-outlined text-3xl text-tertiary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  speed
                </span>
                <div>
                  <div className="font-label text-[10px] uppercase tracking-widest text-outline">Social pressure</div>
                  <div className="font-headline text-lg font-bold text-tertiary sm:text-xl">Community leaderboard</div>
                </div>
              </div>
            </div>
            <div className="rounded-sm bg-surface-container-low/80 p-4 sm:p-6">
              <CommunityStatsBoard variant="full" showShare />
            </div>
          </div>
        </motion.section>

        {/* Pitch: decorative canvas crowd (not txs) + real RPC TPS from blocks */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="w-full"
        >
          <Arena />
        </motion.section>

        {/* Feature cards */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="page-shell--content mx-auto w-full"
        >
          <div className="mb-10 text-center">
            <h2 className="font-headline text-3xl font-bold uppercase italic text-on-surface sm:text-4xl">
              Why Tugmon
            </h2>
            <p className="mx-auto mt-3 max-w-xl font-body text-on-surface-variant">
              Built for demos, events, and stress-tests — with a UI that reads like a tactical atelier, not a
              generic dashboard.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 md:gap-8">
            {[
              {
                title: "Fast rounds",
                body: "High-throughput RPC keeps pulls and boosts feeling instant.",
                icon: "timer",
              },
              {
                title: "Roles",
                body: "Engineer, Saboteur, and Booster change how each match plays out.",
                icon: "groups",
              },
              {
                title: "Big screen",
                body: "Use the dashboard on a TV or projector for events and demos.",
                icon: "tv",
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className={[
                  "group cursor-default bg-surface-container-high p-6 transition-transform stitched-border sm:p-8",
                  i === 1 ? "md:-translate-y-1" : "",
                ].join(" ")}
              >
                <span className="material-symbols-outlined mb-4 text-2xl text-primary">{item.icon}</span>
                <h3 className="font-headline text-xl font-bold text-on-surface">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-outline">{item.body}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* CTA */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.14 }}
          className="w-full max-w-[1000px] self-center"
        >
          <div className="relative rounded-sm bg-gradient-to-br from-surface-container-high to-surface-container-low p-8 text-center stitched-border-primary sm:p-12">
            <div className="pointer-events-none absolute -left-6 top-1/2 hidden -translate-y-1/2 lg:block">
              <span className="material-symbols-outlined text-[100px] text-primary/10">verified</span>
            </div>
            <h2 className="font-headline text-3xl font-extrabold uppercase leading-tight text-on-surface sm:text-4xl md:text-5xl">
              THE VICTORY IS <br />
              <span className="text-tertiary">WOVEN.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg font-body text-on-surface-variant">
              Bridge your in-game burner achievements to your main vault. Every pull counts on-chain — show the
              board on a second screen while phones drive the rope.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 md:flex-row md:gap-6">
              <Link
                href="/play"
                className="inline-flex items-center gap-3 bg-gradient-to-br from-primary to-primary-container px-10 py-4 font-headline text-base font-bold uppercase tracking-widest text-on-primary transition hover:scale-[1.02] active:scale-[0.99]"
              >
                Enter the arena
                <span className="material-symbols-outlined">celebration</span>
              </Link>
              <div className="flex items-center gap-2 font-label text-sm italic text-outline">
                <span className="material-symbols-outlined text-base">link</span>
                Burner → main bridge ready
              </div>
            </div>
          </div>
        </motion.section>

        {/* QR strip */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.18 }}
          className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 rounded-sm bg-surface-container-low px-5 py-8 stitched-border sm:flex-row sm:items-start sm:justify-between sm:gap-10 sm:px-8"
        >
          <div className="flex flex-col text-center sm:text-left">
            <h2 className="font-label text-[10px] font-bold uppercase tracking-[0.25em] text-outline">
              Join from your phone
            </h2>
            <p className="mt-2 max-w-xs font-body text-sm text-on-surface-variant">
              Scan the code to open the play view on another device.
            </p>
            {appUrl && (
              <p className="mt-4 break-all font-mono text-[10px] leading-relaxed text-outline">{playUrl}</p>
            )}
          </div>
          <div className="shrink-0 rounded-sm bg-white p-3 shadow-patch">
            {appUrl && (
              <QRCodeSVG value={playUrl} size={160} bgColor="#ffffff" fgColor="#2c0097" level="H" includeMargin={false} />
            )}
          </div>
        </motion.section>

        <SiteFooter />
      </div>
    </div>
  );
}
