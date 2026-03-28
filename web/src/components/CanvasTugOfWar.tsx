"use client";

import React, { useRef, useEffect, useCallback } from 'react';

export interface CanvasTugOfWarProps {
  role?: 'Engineer' | 'Booster' | 'Saboteur' | 'None';
  team?: 'Red' | 'Blue';
  onPull?: () => void;
  serverRopePosition?: number; // Backendden gelen güncel pozisyon
}

export const CanvasTugOfWar: React.FC<CanvasTugOfWarProps> = ({ 
  role = 'Engineer', 
  team = 'Red',
  onPull,
  serverRopePosition = 0
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Animasyon için değerleri Ref ile tutuyoruz (state kullanırsak her frame'de render tetiklenir)
  const currentDrawPos = useRef(0);
  const targetPos = useRef(serverRopePosition);

  // Server'dan yeni pozisyon gelirse hedef pozisyonu güncelle
  useEffect(() => {
    targetPos.current = serverRopePosition;
  }, [serverRopePosition]);

  // Mobilde ekran kaymasını (scroll/zoom) tam anlamıyla durduran özel hook
  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      // Sadece oyun alanındayken kaydırmayı engelle
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        if (e.touches.length > 1) { // Çift parmak zoom engelle
            e.preventDefault();
        }
      }
    };
    
    // Uygulama seviyesinde touchmove kapatılıyor (passive: false kritik önemde)
    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  // Canvas Animasyon ve Çizim Döngüsü
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    // Retina / Yüksek Çözünürlüklü Mobil Ekran Optimizasyonu
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1; // Piksel yoğunluğu (iPhone'larda 2 veya 3)
      
      width = rect.width;
      height = rect.height;
      
      // Canvas iç çözünürlüğünü ekran cihaz piksel ratio'suna göre artırıyoruz
      // Bu sayede bulanıklık tamamen kalkıyor ve profesyonel/keskin görünüyor
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      
      ctx.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    window.addEventListener('resize', resize);
    resize();

    const draw = () => {
      // LERP (Linear Interpolation) ile pürüzsüz halat animasyonu
      // Hedefe doğru yavaşlayarak kayar, 60 FPS'te çok profesyonel hissettirir.
      currentDrawPos.current += (targetPos.current - currentDrawPos.current) * 0.15;

      // Ekranı temizle
      ctx.clearRect(0, 0, width, height);
      
      const centerY = height / 2;
      const centerX = width / 2;

      // --- Arka Plan Geometrisi ---
      ctx.fillStyle = '#1e3a8a'; // Mavi Takım (Sol)
      ctx.fillRect(0, 0, centerX + currentDrawPos.current, height);
      
      ctx.fillStyle = '#7f1d1d'; // Kırmızı Takım (Sağ)
      ctx.fillRect(centerX + currentDrawPos.current, 0, width, height);

      // --- Merkez Çizgisi çizimi ---
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.setLineDash([10, 15]);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]); // Çizgiyi sıfırla

      // --- Halat çizimi ---
      ctx.beginPath();
      // Halat uçlara kadar uzansın
      ctx.moveTo(-50, centerY);
      ctx.lineTo(width + 50, centerY);
      ctx.strokeStyle = '#d4d4d8'; // Grimsi beyaz halat
      ctx.lineWidth = 8;
      ctx.stroke();

      // --- Düğüm Noktası (Mendil) ---
      const knotX = centerX + currentDrawPos.current;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(knotX, centerY, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24'; // Altın sarısı
      ctx.fill();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.shadowBlur = 0; // Shadow sıfırla

      // --- Temsili Karakterler ---
      // Karakterleri halata bağlı olarak hareket ettiriyoruz
      
      // Mavi Karakter (Solda, Sağ tarafa asılır)
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(knotX - 100, centerY - 25, 40, 50);
      
      // Kırmızı Karakter (Sağda, Sol tarafa asılır)
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(knotX + 60, centerY - 25, 40, 50);

      animationFrameId = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handlePull = useCallback((e: React.PointerEvent) => {
    // Çift tıklamada zoomu önlemek için
    if (e.nativeEvent) {
        e.preventDefault();
    }

    // Rol bazlı çekme gücü (1 veya 2 olabilir, arayüzde abartı göstermek için * 5)
    const power = role === 'Engineer' ? 10 : 5;
    
    // Kırmızıysa sağa (+), Maviyse sola (-) çekmeli ki kendi tarafına doğru hareket etsin.
    const direction = team === 'Red' ? 1 : -1;
    
    // Optimistic Update: Blockchain yanıtını beklemeden görselliği anında değiştir
    targetPos.current += (power * direction);

    // Haptic Feedback: Dokunmatik ekranlarda titreşim vererek 
    // butona basma hissiyatını fizikselleştir (Çok premium bir histir)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30); 
    }
    
    // Üst bileşene haber ver (Smart contract trigger)
    if (onPull) {
        onPull();
    }
  }, [role, team, onPull]);

  return (
    <div 
      ref={containerRef} 
      // tailwind overscroll-none: Mobilde swipe-to-back/refresh engeller
      // touch-none pan/zoom engeller
      className="flex flex-col h-full w-full max-h-screen bg-black touch-none select-none overflow-hidden overscroll-none"
    >
      {/* 1. Üst Kısım: Oyun / Çizim Alanı */}
      <div className="w-full h-2/3 relative flex-shrink-0">
        <canvas 
          ref={canvasRef} 
          className="w-full h-full block touch-none"
        />
        
        {/* Dekoratif Skor Alanları */}
        <div className="absolute top-4 left-6 text-white font-black text-2xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] opacity-60">
          MAVİ
        </div>
        <div className="absolute top-4 right-6 text-white font-black text-2xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] opacity-60">
          KIRMIZI
        </div>
      </div>

      {/* 2. Alt Kısım: Kontrol / Aksiyon Alanı */}
      <div className="h-1/3 w-full bg-gray-950 p-6 flex flex-col items-center justify-center border-t border-gray-800 flex-grow">
        <button 
          onPointerDown={handlePull} 
          // 3D Buton: Box-shadow yerine border-b kullanarak mobilde sıfır kasma ile kaliteli fiziksel buton hissiyatı yapıldı
          className={`
            w-full max-w-sm h-full rounded-2xl transition-all select-none focus:outline-none
            flex flex-col items-center justify-center border-b-[8px] active:border-b-[0px] active:translate-y-[8px]
            ${team === 'Red' 
              ? 'bg-red-600 border-red-900 hover:bg-red-500 active:bg-red-700 text-red-50' 
              : 'bg-blue-600 border-blue-900 hover:bg-blue-500 active:bg-blue-700 text-blue-50'
            }
          `}
        >
          {/* pointer-events-none: İçteki text'ler butona tıklamayı engellemesin */}
          <span className="font-black text-5xl uppercase tracking-wider drop-shadow-md pointer-events-none">
            ÇEK!
          </span>
          <span className="mt-2 font-bold opacity-80 pointer-events-none tracking-wide">
            Rolün: {role}
          </span>
        </button>
      </div>
    </div>
  );
};

export default CanvasTugOfWar;
