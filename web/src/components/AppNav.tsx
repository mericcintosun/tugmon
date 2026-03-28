"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/play", label: "Play" },
  { href: "/play/offline", label: "Offline" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

export default function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-[100] border-b border-white/[0.06] bg-[#040408]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="font-semibold tracking-tight text-white transition hover:text-white/90"
          onClick={() => setOpen(false)}
        >
          <span className="text-sm sm:text-base">Tugmon</span>
          <span className="ml-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-white/35">
            Arena
          </span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
          {links.map(({ href, label }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-white/[0.08] text-white"
                    : "text-white/55 hover:bg-white/[0.05] hover:text-white/90",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 hover:bg-white/[0.06] sm:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="sr-only">Menu</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? (
              <>
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </>
            ) : (
              <>
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </>
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-white/[0.06] bg-[#040408]/95 px-4 py-3 sm:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {links.map(({ href, label }) => {
              const active = pathname === href || (href !== "/" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "rounded-lg px-3 py-3 text-sm font-medium",
                    active ? "bg-white/[0.08] text-white" : "text-white/70",
                  ].join(" ")}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
