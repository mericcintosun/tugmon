import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const orbitron  = Orbitron({ variable: "--font-orbitron",  subsets: ["latin"], weight: ["400","700","900"] });

export const metadata: Metadata = {
  title: "TUGMON — Monad Tug of War",
  description: "Real-time on-chain tug-of-war. Powered by Monad.",
};

export const viewport: Viewport = {
  themeColor: "#040408",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} h-full antialiased`}>
      <body suppressHydrationWarning className="min-h-full bg-[#040408] text-white">{children}</body>
    </html>
  );
}
