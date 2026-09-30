import { Check, Hourglass } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import type { EditProposal } from '../../lib/api';
import { STATUS, deriveItemType } from '../../design/tokens';
import { haptic } from '../../lib/haptics';

// ＋αで出された、まだ確かめ終わっていない提案（2026-09-29）。
// Waze の「まだある？」にならい、ほかの人が「合っている」を押せる。同じ提案が別の人から届くと、
// リンクで確かめられないものでもボットが反映する（api/_submissions.ts）。
// 自分の提案は「確認中」とだけ出す。反映されなかったものは、出した本人にだけ理由を出す（7日間）。

/** 提案の中身を1行ずつの文にする */
export function describePatch(p: EditProposal['patch'], type: CalendarEvent['type']): string[] {
  const md = (d?: string | null) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : 'なし');
  const out: string[] = [];
  if ('date' in p) out.push(`${type === 'goods' ? '発売日' : '日付'}を ${md(p.date)} に`);
  if ('endDate' in p) out.push(`終了日を ${md(p.endDate)} に`);
  if ('time' in p) out.push(`時刻を ${p.time || 'なし'} に`);
  if ('preorderStart' in p) out.push(`予約開始を ${md(p.preorderStart)} に`);
  if ('preorderEnd' in p) out.push(`予約締切を ${md(p.preorderEnd)} に`);
  if ('isOrderMade' in p) out.push(p.isOrderMade ? '予約・受注ありに' : '予約・受注なしに');
  if (p.saleStatus) out.push(`${type === 'goods' ? '発売状況' : '開催状況'}を「${STATUS[p.saleStatus][type === 'goods' ? 'goodsLabel' : 'eventLabel']}」に`);
  if (typeof p.price === 'number') out.push(`値段を ¥${p.price.toLocaleString()} に`);
  if (p.addedOfferUrl) {
    let host = p.addedOfferUrl;
    try { host = new URL(p.addedOfferUrl).host.replace(/^www\./, ''); } catch { /* そのまま */ }
    out.push(`購入リンクを追加（${host}）`);
  }
  return out;
}

/** 同じ中身の提案か（「合っている」を押したかの判定・同じ提案を重ねて出さない） */
export const samePatch = (a: EditProposal['patch'], b: EditProposal['patch']) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

interface Props {
  event: CalendarEvent;
  proposals: EditProposal[];
  userId: string | null;
  onAgree: (p: EditProposal) => void;
}

export default function PendingProposals({ event, proposals, userId, onAgree }: Props) {
  const type = deriveItemType(event);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const pending = proposals.filter((p) => p.status === 'pending');
  // 同じ中身の提案はひとつにまとめて、何人が言っているかを出す
  const groups: { head: EditProposal; count: number; mine: boolean }[] = [];
  for (const p of pending) {
    const g = groups.find((x) => samePatch(x.head.patch, p.patch));
    if (g) { g.count++; g.mine ||= p.createdBy === userId; }
    else groups.push({ head: p, count: 1, mine: p.createdBy === userId });
  }
  const myRejected = proposals.filter((p) => p.status === 'rejected' && p.createdBy === userId && Date.parse(p.createdAt) > weekAgo);
  if (!groups.length && !myRejected.length) return null;

  return (
    <div className="mt-4 rounded-[12px] px-3 py-2.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {groups.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-label-secondary">
            <Hourglass size={13} /> 確認中の情報
          </div>
          {groups.map(({ head, count, mine }) => (
            <div key={head.id} className="flex items-center gap-2 mt-2">
              <div className="flex-1 min-w-0 text-[13px] leading-snug">
                {describePatch(head.patch, type).join('・')}
                <span className="text-[11px] text-label-tertiary">{count > 1 ? `（${count}人）` : ''}</span>
              </div>
              {mine ? (
                <span className="text-[11px] text-label-tertiary flex-shrink-0">あなたの提案</span>
              ) : userId && (
                <button onClick={() => { haptic.select(); onAgree(head); }}
                  className="pressable flex-shrink-0 flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                  <Check size={13} /> 合っている
                </button>
              )}
            </div>
          ))}
          <p className="text-[11px] text-label-tertiary mt-2">リンクで確かめられたもの・ほかの人も同じことを言っているものから反映します</p>
        </>
      )}
      {myRejected.map((p) => (
        <div key={p.id} className="text-[12px] text-label-secondary mt-2">
          反映されませんでした：{describePatch(p.patch, type).join('・')}{p.reason ? `（${p.reason}）` : ''}
        </div>
      ))}
    </div>
  );
}
