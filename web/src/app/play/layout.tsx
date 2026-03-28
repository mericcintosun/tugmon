import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Play",
  description: "Join the Gmonad War — pick rope side, crew, and pull on Monad testnet.",
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
