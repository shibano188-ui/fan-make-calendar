// 場面ごとのヒント（components/Hints.tsx）を見たかどうか。最初の案内（OnboardingTour）で説明したものも、ここで見たことにする
const SEEN_KEY = 'fan_hints_seen';

export function loadHintsSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}

export function markHintsSeen(...ids: string[]): void {
  const s = loadHintsSeen();
  ids.forEach((id) => s.add(id));
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch { /* この起動の間だけ覚える */ }
}
