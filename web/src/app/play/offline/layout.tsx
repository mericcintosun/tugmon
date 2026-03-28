import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline",
  description: "Local tug-of-war practice — no chain, same crew flow.",
};

export default function OfflinePlayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
