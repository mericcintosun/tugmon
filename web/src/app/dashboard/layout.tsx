import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "War Room",
  description: "Live scores, MVP board, and arena telemetry for Tugmon on Monad.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
