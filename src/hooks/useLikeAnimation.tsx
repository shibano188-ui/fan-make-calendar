import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import React from 'react';
import { haptic } from '../lib/haptics';

interface Particle {
  id: number;
  x: number; y: number;
  tx: number; ty: number;
  size: number;
  spin: number;
}

interface Ripple {
  id: number;
  x: number; y: number;
}

interface Floater {
  id: number;
  x: number; y: number;
}

export function useLikeAnimation() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [ripples, setRipples]     = useState<Ripple[]>([]);
  const [floaters, setFloaters]   = useState<Floater[]>([]);

  const trigger = useCallback((el: HTMLElement) => {
    haptic.light();
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const now = Date.now();

    // 放射状パーティクル（❤️ のみ、6個）
    const N = 6;
    const newParticles: Particle[] = Array.from({ length: N }, (_, i) => {
      const angle = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist  = 30 + Math.random() * 28;
      return {
        id:   now * 100 + i,
        x: cx, y: cy,
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist,
        size: 11 + Math.random() * 7,
        spin: Math.random() * 360,
      };
    });
    setParticles(prev => [...prev, ...newParticles]);
    const pids = new Set(newParticles.map(p => p.id));
    setTimeout(() => setParticles(prev => prev.filter(p => !pids.has(p.id))), 800);

    // リップル波紋
    const rid = now;
    setRipples(prev => [...prev, { id: rid, x: cx, y: cy }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== rid)), 500);

    // 上昇フローティングハート（1〜2個）
    const fCount = Math.random() > 0.5 ? 2 : 1;
    const newFloaters: Floater[] = Array.from({ length: fCount }, (_, i) => ({
      id: now + i + 5000,
      x: cx + (Math.random() - 0.5) * rect.width * 0.7,
      y: cy,
    }));
    setFloaters(prev => [...prev, ...newFloaters]);
    const fids = new Set(newFloaters.map(f => f.id));
    setTimeout(() => setFloaters(prev => prev.filter(f => !fids.has(f.id))), 1000);
  }, []);

  // document.body へのポータルで PhoneFrame の transform の影響を受けない
  const renderOverlay = () => createPortal(
    <>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'fixed',
            left: p.x,
            top:  p.y,
            '--ptx':   `${p.tx}px`,
            '--pty':   `${p.ty}px`,
            '--pspin': `${p.spin}deg`,
            fontSize:  p.size,
            lineHeight: 1,
            animation: 'particleBurst 0.72s cubic-bezier(0.25,0.46,0.45,0.94) forwards',
            pointerEvents: 'none',
            zIndex: 99999,
            userSelect: 'none',
          } as React.CSSProperties}
        >
          ❤️
        </div>
      ))}
      {ripples.map(r => (
        <div
          key={r.id}
          style={{
            position: 'fixed',
            left: r.x - 20,
            top:  r.y - 20,
            width: 40, height: 40,
            borderRadius: '50%',
            border: '1.5px solid rgba(248,113,113,0.8)',
            animation: 'rippleOut 0.45s ease-out forwards',
            pointerEvents: 'none',
            zIndex: 99999,
          }}
        />
      ))}
      {floaters.map(f => (
        <span
          key={f.id}
          style={{
            position: 'fixed',
            left: f.x,
            top:  f.y,
            fontSize: 18,
            lineHeight: 1,
            animation: 'floatHeart 0.9s cubic-bezier(0.22,1,0.36,1) forwards',
            pointerEvents: 'none',
            zIndex: 99999,
            userSelect: 'none',
          }}
        >
          ❤️
        </span>
      ))}
    </>,
    document.body
  );

  return { trigger, renderOverlay };
}
