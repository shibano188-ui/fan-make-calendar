import { useState, useCallback } from 'react';

interface Particle {
  id: number;
  emoji: string;
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

const EMOJIS = ['❤️', '❤️', '❤️', '✨', '✨', '💕'];

export function useLikeAnimation() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [floaters, setFloaters] = useState<Floater[]>([]);

  const trigger = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const now = Date.now();

    // 放射状パーティクル（6個）
    const N = 6;
    const newParticles: Particle[] = Array.from({ length: N }, (_, i) => {
      const angle = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const dist = 30 + Math.random() * 28;
      return {
        id: now * 100 + i,
        emoji: EMOJIS[i % EMOJIS.length],
        x: cx, y: cy,
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist,
        size: 10 + Math.random() * 8,
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

  return { trigger, particles, ripples, floaters };
}
