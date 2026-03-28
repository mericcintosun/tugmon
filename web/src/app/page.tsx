"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { CommunityStatsBoard } from "@/components/CommunityStatsBoard";

export default function LandingPage() {
  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    const timerId = setTimeout(() => {
      const envUrl = process.env.NEXT_PUBLIC_APP_URL;
      setAppUrl(envUrl || window.location.origin);
    }, 0);
    return () => clearTimeout(timerId);
  }, []);

  const playUrl = `${appUrl}/play`;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.22), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(59, 130, 246, 0.08), transparent), radial-gradient(ellipse 50% 40% at 0% 80%, rgba(239, 68, 68, 0.06), transparent)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/40">
            Monad testnet
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Pull together. Win on-chain.
          </h1>
          <p className="mt-5 text-pretty text-base leading-relaxed text-white/55 sm:text-lg">
            <span className="text-violet-200/90">The Gmonad War</span> turns the arena into a social
            coordination experiment: pledge to a Monad crew, stress-test the chain with your burner, and
            link your main wallet so NFTs buff your pulls.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/play"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-semibold text-[#040408] transition hover:bg-white/90"
            >
              Start playing
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-8 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/[0.07]"
            >
              Open live board
            </Link>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06 }}
          className="mx-auto mt-14 w-full max-w-3xl rounded-3xl border border-violet-500/15 bg-gradient-to-br from-violet-950/40 via-[#0a0a10] to-fuchsia-950/25 px-5 py-8 sm:px-8"
        >
          <CommunityStatsBoard variant="full" showShare />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="mx-auto mt-20 grid max-w-3xl gap-6 sm:grid-cols-3"
        >
          {[
            {
              title: "Fast rounds",
              body: "High-throughput RPC keeps pulls and boosts feeling instant.",
            },
            {
              title: "Roles",
              body: "Engineer, Saboteur, and Booster change how each match plays out.",
            },
            {
              title: "Big screen",
              body: "Use the dashboard on a TV or projector for events and demos.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-6 text-left"
            >
              <h2 className="text-sm font-semibold text-white">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/45">{item.body}</p>
            </div>
          ))}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="mx-auto mt-16 flex w-full max-w-xl flex-col items-center gap-8 rounded-3xl border border-white/[0.07] bg-white/[0.03] px-6 py-10 sm:flex-row sm:items-start sm:justify-between sm:gap-12"
        >
          <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Join from your phone
            </h2>
            <p className="mt-2 max-w-xs text-sm text-white/50">
              Scan the code to open the play view on another device.
            </p>
            {appUrl && (
              <p className="mt-4 break-all font-mono text-[10px] leading-relaxed text-white/35">
                {playUrl}
              </p>
            )}
          </div>
          <div className="shrink-0 rounded-2xl bg-white p-3 shadow-xl shadow-black/40">
            {appUrl && (
              <QRCodeSVG value={playUrl} size={160} bgColor="#ffffff" fgColor="#040408" level="H" includeMargin={false} />
            )}
          </div>
        </motion.section>

        <footer className="mt-auto pt-16 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-white/25">
            Built for Monad · Tugmon
          </p>
        </footer>
      </div>
    </div>
  );
}
