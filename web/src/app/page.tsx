  'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';

export default function LandingPage() {
  const [appUrl, setAppUrl] = useState('');

  useEffect(() => {
    // Only access env/location on client side so SSR and dev don't mismatch
    // Wrapping in setTimeout prevents the "synchronous cascading render" lint error
    // by allowing the initial render to paint first.
    const timerId = setTimeout(() => {
      const envUrl = process.env.NEXT_PUBLIC_APP_URL;
      setAppUrl(envUrl || window.location.origin);
    }, 0);
    
    return () => clearTimeout(timerId);
  }, []);

  const playUrl = `${appUrl}/play`;

  return (
    <div className="min-h-screen bg-[#040408] text-white flex flex-col relative overflow-hidden font-sans">
      
      {/* Background glowing orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-purple-900/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-6 py-10 w-full max-w-5xl mx-auto">
        
        {/* Header Text */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-4 mb-14"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-bold uppercase tracking-widest backdrop-blur-sm mb-4">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            Monad Testnet
          </div>
          <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-300 to-indigo-500 pb-2">
            TUGMON ARENA
          </h1>
          <p className="text-gray-400 text-lg md:text-2xl font-medium tracking-wide max-w-xl mx-auto">
            Experience 10,000+ TPS on-chain tug-of-war. Scan to join your team and pull!
          </p>
        </motion.div>

        {/* Action Section */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 w-full">
          
          {/* QR Code Panel */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="flex flex-col items-center p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Scan to Play</h2>
            
            <div className="bg-white p-4 rounded-2xl relative">
              {/* Scan box corners */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-indigo-500 rounded-tl-xl" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-indigo-500 rounded-tr-xl" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-indigo-500 rounded-bl-xl" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-indigo-500 rounded-br-xl" />
              
              {appUrl && (
                <QRCodeSVG
                  value={playUrl}
                  size={240}
                  bgColor="#ffffff"
                  fgColor="#040408"
                  level="H"
                  includeMargin={false}
                />
              )}
            </div>

            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500 font-mono break-all px-4">{playUrl}</p>
            </div>
          </motion.div>

          {/* Quick Links */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col gap-6 w-full max-w-[280px]"
          >
            <div className="space-y-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest text-center md:text-left">
                Direct Access
              </p>
              
              <Link href="/play" className="group relative w-full flex items-center justify-between p-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg hover:shadow-indigo-500/25">
                <span className="font-bold text-lg tracking-wide">Enter Arena 📱</span>
                <span className="opacity-70 group-hover:translate-x-1 transition-transform">→</span>
              </Link>
              
              <Link href="/dashboard" className="group relative w-full flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
                <div className="flex flex-col">
                  <span className="font-bold text-lg tracking-wide text-gray-300">Live Dashboard 🖥️</span>
                  <span className="text-[10px] text-gray-500 mt-0.5">Big screen monitor view</span>
                </div>
                <span className="opacity-70 group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
          </motion.div>
        </div>

      </div>

      {/* Footer */}
      <div className="py-6 text-center z-10">
        <p className="text-[10px] font-black tracking-[0.4em] text-gray-600 select-none">
          POWERED BY MONAD LUDICROUS SPEED
        </p>
      </div>
    </div>
  );
}
