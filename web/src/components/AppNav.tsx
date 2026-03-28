"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { isNavLinkActive } from "@/lib/navActive";

const links = [
  { href: "/", label: "Arena" },
  { href: "/play", label: "Play" },
  { href: "/play/offline", label: "Offline" },
  { href: "/dashboard", label: "War Room" },
] as const;

export default function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-[100] border-b border-outline-variant/50 bg-surface-container-low/90 shadow-[0_1px_0_rgba(175,162,255,0.06)] backdrop-blur-xl backdrop-saturate-150">
      <div className="page-shell flex min-h-[var(--layout-nav-min-h)] items-center justify-between gap-3 py-3 sm:gap-4 sm:py-3.5">
        <Link
          href="/"
          className="group flex min-w-0 shrink-0 items-center gap-3 rounded-sm outline-none ring-primary/0 transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="Tugmon — home"
        >
          <Image
            src="/logo.png"
            alt=""
            width={56}
            height={56}
            className="h-10 w-10 shrink-0 object-contain transition-transform duration-300 group-hover:scale-[1.02] sm:h-11 sm:w-11"
            priority
          />
          <div className="hidden min-w-0 flex-col leading-none sm:flex">
            <span className="font-headline text-lg font-bold tracking-tight text-on-surface sm:text-xl">
              Tugmon
            </span>
            <span className="mt-1 font-label text-[9px] font-medium uppercase tracking-[0.22em] text-outline">
              Monad arena
            </span>
          </div>
        </Link>

        <nav
          className="hidden items-center rounded-full border border-outline-variant/60 bg-surface-container/90 p-1 shadow-inner md:flex"
          aria-label="Primary"
        >
          {links.map(({ href, label }) => {
            const active = isNavLinkActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "relative rounded-full px-4 py-2 font-label text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low",
                  active
                    ? "text-on-primary"
                    : "text-on-surface-variant hover:text-on-surface",
                ].join(" ")}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill-active"
                    className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-primary to-primary-container shadow-[0_0_20px_rgba(175,162,255,0.25)]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden rounded-full border border-tertiary/25 bg-tertiary/10 px-3 py-1.5 font-label text-[9px] font-bold uppercase tracking-[0.2em] text-tertiary/95 lg:inline">
            Testnet
          </span>
          <Link
            href="/play"
            className="hidden h-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-container px-5 font-label text-[11px] font-bold uppercase tracking-[0.12em] text-on-primary shadow-[0_0_24px_rgba(175,162,255,0.2)] transition hover:opacity-95 hover:shadow-[0_0_28px_rgba(175,162,255,0.28)] active:scale-[0.98] sm:inline-flex"
          >
            Enter arena
          </Link>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/70 bg-surface-container-high/80 text-on-surface transition hover:border-outline hover:bg-surface-container-high md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="sr-only">Menu</span>
            <span className="material-symbols-outlined text-[26px]" aria-hidden>
              {open ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence mode="sync">
        {open && (
          <>
            <motion.button
              key="nav-backdrop"
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-[90] bg-background/70 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="nav-panel"
              id="mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="relative z-[95] border-t border-outline-variant/50 bg-surface-container-low/98 shadow-[0_24px_48px_rgba(0,0,0,0.35)] md:hidden"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="page-shell py-4">
                <p className="mb-3 font-label text-[10px] font-bold uppercase tracking-[0.25em] text-outline">
                  Navigate
                </p>
                <nav className="flex flex-col gap-1" aria-label="Mobile">
                  {links.map(({ href, label }) => {
                    const active = isNavLinkActive(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={[
                          "flex items-center justify-between rounded-lg border px-4 py-3.5 font-headline text-[15px] font-semibold tracking-tight transition-colors outline-none",
                          "focus-visible:ring-2 focus-visible:ring-primary/45",
                          active
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-outline-variant/50 bg-surface-container/60 text-on-surface-variant hover:border-outline hover:text-on-surface",
                        ].join(" ")}
                        onClick={() => setOpen(false)}
                      >
                        {label}
                        <span className="material-symbols-outlined text-xl text-outline/60" aria-hidden>
                          chevron_right
                        </span>
                      </Link>
                    );
                  })}
                </nav>
                <Link
                  href="/play"
                  className="mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-container font-label text-xs font-bold uppercase tracking-[0.15em] text-on-primary transition hover:opacity-95 active:scale-[0.99]"
                  onClick={() => setOpen(false)}
                >
                  Enter arena
                </Link>
                <p className="mt-4 text-center font-label text-[9px] uppercase tracking-[0.2em] text-outline">
                  Monad testnet
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
