import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Manrope, Space_Grotesk, Geist_Mono } from "next/font/google";
import AppNav from "@/components/AppNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Tugmon — Stitched for speed",
    template: "%s · Tugmon",
  },
  description:
    "Real-time multiplayer tug-of-war on Monad testnet. Burner play, crew leaderboards, and on-chain pulls — minimal wallet setup.",
  applicationName: "Tugmon",
  keywords: ["Tugmon", "Monad", "tug of war", "on-chain game", "testnet", "Gmonad"],
  authors: [{ name: "Tugmon" }],
  creator: "Tugmon",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/logo.png", sizes: "180x180" }],
    shortcut: "/logo.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Tugmon Arena",
    title: "Tugmon — Stitched for speed",
    description:
      "Real-time multiplayer tug-of-war on Monad. Pull with your crew, stress-test the chain, bridge NFT power.",
    images: [
      {
        url: "/metatag-banner.png",
        width: 1200,
        height: 630,
        alt: "Tugmon Arena — on-chain tug of war on Monad",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tugmon — Stitched for speed",
    description:
      "Real-time multiplayer tug-of-war on Monad testnet. Burner play, crew stats, on-chain pulls.",
    images: ["/metatag-banner.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Tugmon Arena",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0d18",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${plusJakartaSans.variable} ${manrope.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="flex min-h-dvh flex-col bg-background font-body text-on-surface selection:bg-primary/35 selection:text-on-background"
      >
        <ServiceWorkerRegister />
        <AppNav />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
