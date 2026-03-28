import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import AppNav from "@/components/AppNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const orbitron  = Orbitron({ variable: "--font-orbitron",  subsets: ["latin"], weight: ["400","700","900"] });

export const metadata: Metadata = {
  title: "Tugmon — On-chain tug of war",
  description: "Real-time multiplayer tug-of-war on Monad. Minimal wallet setup, instant play.",
  applicationName: "Tugmon",
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    title: "Tugmon Arena",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#040408",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} h-full antialiased`}>
      <body suppressHydrationWarning className="flex min-h-dvh flex-col bg-[#040408] text-white">
        <ServiceWorkerRegister />
        <AppNav />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
