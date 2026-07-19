// Apple流の流体UI基盤: スプリング・慣性投影・ラバーバンド。
// パラメータは damping ratio（1.0=バウンスなし / <1.0=オーバーシュート）と
// response（目標到達の速さ・秒）の2つ。duration固定のアニメーションは使わない。

export interface SpringOptions {
  from: number;
  to: number;
  /** 初速 px/s（ジェスチャーのリリース速度をそのまま渡す） */
  velocity?: number;
  /** 1.0 = critically damped（既定）。運動量を伴う操作のみ 0.8 程度に */
  damping?: number;
  /** 目標到達の速さ（秒）。既定 0.35 */
  response?: number;
  onUpdate: (value: number) => void;
  onSettle?: () => void;
}

export interface SpringHandle {
  /** 進行中でも目標を差し替える（現在値・現在速度から連続的に再出発） */
  retarget: (to: number) => void;
  /** 停止して現在値を返す（指でつかんだときに呼ぶ） */
  stop: () => number;
  readonly value: number;
  readonly velocity: number;
  readonly running: boolean;
}

/** rAF駆動のスプリング。中断可能・速度連続。 */
export function spring(opts: SpringOptions): SpringHandle {
  const damping = opts.damping ?? 1.0;
  const response = Math.max(0.05, opts.response ?? 0.35);
  const omega = (2 * Math.PI) / response; // 角周波数
  const k = omega * omega;                // ばね定数（単位質量）
  const c = 2 * damping * omega;          // 減衰係数

  let x = opts.from;
  let v = opts.velocity ?? 0;
  let target = opts.to;
  let raf = 0;
  let running = true;
  let last = performance.now();

  const tick = (now: number) => {
    // タブ復帰などの巨大dtで発散しないよう上限を設け、安定のため小刻みに積分する
    let dt = Math.min((now - last) / 1000, 0.064);
    last = now;
    while (dt > 0) {
      const h = Math.min(dt, 1 / 120);
      const a = -k * (x - target) - c * v;
      v += a * h;
      x += v * h;
      dt -= h;
    }
    if (Math.abs(x - target) < 0.1 && Math.abs(v) < 1) {
      x = target;
      running = false;
      opts.onUpdate(x);
      opts.onSettle?.();
      return;
    }
    opts.onUpdate(x);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    retarget(to: number) {
      target = to;
      if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      return x;
    },
    get value() { return x; },
    get velocity() { return v; },
    get running() { return running; },
  };
}

/**
 * 慣性投影: リリース速度からスクロール減衰と同じ式で静止位置を予測する。
 * 「離した位置」ではなく「向かっている位置」で行き先を決めるために使う。
 */
export function project(initialVelocity: number, decelerationRate = 0.998): number {
  return ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** 境界を越えたドラッグへの漸進的な抵抗。硬い壁ではなく徐々に重くする。 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** 直近サンプルからリリース速度(px/s)を求める。pointermoveごとに add する。 */
export function createVelocityTracker() {
  let samples: { p: number; t: number }[] = [];
  return {
    add(p: number) {
      const t = performance.now();
      samples.push({ p, t });
      // 直近100msだけ保持
      samples = samples.filter((s) => t - s.t < 100);
    },
    /** px/s。サンプル不足時は 0 */
    get(): number {
      if (samples.length < 2) return 0;
      const first = samples[0];
      const lastS = samples[samples.length - 1];
      const dt = (lastS.t - first.t) / 1000;
      if (dt <= 0) return 0;
      return (lastS.p - first.p) / dt;
    },
    reset() { samples = []; },
  };
}

/** 動きを減らす設定（前庭刺激への配慮）。trueならスライドでなくフェードにする */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
