"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/", label: "Arena" },
  { href: "/play", label: "Play" },
  { href: "/play/offline", label: "Offline" },
  { href: "/dashboard", label: "War Room" },
] as const;

export default function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-[100] border-b border-dashed border-outline-variant bg-surface-dim/95 shadow-patch backdrop-blur-xl">
      <div className="mx-auto flex min-h-14 max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link
          href="/"
          className="font-headline text-lg font-bold tracking-tighter text-primary sm:text-xl"
          onClick={() => setOpen(false)}
        >
          TUGMON
          <span className="ml-2 text-[10px] font-normal uppercase tracking-[0.28em] text-on-surface-variant">
            Arena
          </span>
        </Link>

        <nav className="hidden items-center gap-1 font-headline tracking-tight md:flex" aria-label="Primary">
          {links.map(({ href, label }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "rounded-sm px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-b-2 border-primary pb-1 text-primary"
                    : "text-outline hover:text-primary",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span
            className="material-symbols-outlined hidden text-outline transition-colors hover:text-primary sm:inline"
            aria-hidden
          >
            chat
          </span>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-sm text-on-surface-variant hover:bg-surface-container-high md:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="sr-only">Menu</span>
            <span className="material-symbols-outlined text-2xl">{open ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-dashed border-outline-variant bg-surface-container-low px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1 font-headline" aria-label="Mobile">
            {links.map(({ href, label }) => {
              const active = pathname === href || (href !== "/" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "rounded-sm px-3 py-3 text-sm",
                    active ? "bg-surface-container-high text-primary" : "text-on-surface-variant",
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
