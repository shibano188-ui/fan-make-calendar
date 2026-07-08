import { useState } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import Chip from '../ui/Chip';
import { REGIONS } from '../../lib/prefectures';

export interface Facet {
  key: string;
  label: string;
  count: number;
}

interface Props {
  statuses: Facet[];
  works: Facet[];
  categories: Facet[];
  prefectures: Facet[];
  regions: Facet[];
  selectedStatuses: Set<string>;
  selectedWorks: Set<string>;
  selectedCategories: Set<string>;
  selectedPrefs: Set<string>;
  selectedRegions: Set<string>;
  onToggleStatus: (k: string) => void;
  onToggleWork: (k: string) => void;
  onToggleCategory: (k: string) => void;
  onTogglePref: (k: string) => void;
  onToggleRegion: (k: string) => void;
  homePref?: string | null;
  neighborActive: boolean;
  onToggleNeighbor: () => void;
  onClear: () => void;
  resultCount: number;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[12px] font-semibold text-label-secondary mb-1.5">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** その場で開閉する折りたたみフィルタ（全画面でない）。作品・カテゴリ・地域を件数つきで複数選択。 */
export default function FilterPanel({
  statuses, works, categories, prefectures, regions,
  selectedStatuses, selectedWorks, selectedCategories, selectedPrefs, selectedRegions,
  onToggleStatus, onToggleWork, onToggleCategory, onTogglePref, onToggleRegion,
  homePref, neighborActive, onToggleNeighbor, onClear, resultCount,
}: Props) {
  const [prefOpen, setPrefOpen] = useState(false);
  // 都道府県チップを地方ごとにグルーピング（結果に出る県のみ）。
  const prefGroups = REGIONS
    .map((r) => ({ region: r.name, prefs: prefectures.filter((p) => r.prefectures.includes(p.key)) }))
    .filter((g) => g.prefs.length > 0);

  return (
    <div className="mt-2 rounded-[8px] shadow-elevated" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="max-h-[46vh] overflow-y-auto no-scrollbar px-3 py-3">
        {statuses.length > 0 && (
          <Section title="状態">
            {statuses.map((s) => (
              <Chip key={s.key} active={selectedStatuses.has(s.key)} onClick={() => onToggleStatus(s.key)}>
                {s.label} <span className="opacity-60">{s.count}</span>
              </Chip>
            ))}
          </Section>
        )}
        {works.length > 0 && (
          <Section title="作品">
            {works.map((w) => (
              <Chip key={w.key} active={selectedWorks.has(w.key)} onClick={() => onToggleWork(w.key)}>
                {w.label} <span className="opacity-60">{w.count}</span>
              </Chip>
            ))}
          </Section>
        )}
        {categories.length > 0 && (
          <Section title="カテゴリ">
            {categories.map((c) => (
              <Chip key={c.key} active={selectedCategories.has(c.key)} onClick={() => onToggleCategory(c.key)}>
                {c.label} <span className="opacity-60">{c.count}</span>
              </Chip>
            ))}
          </Section>
        )}
        {(regions.length > 0 || prefectures.length > 0 || homePref) && (
          <Section title="地域">
            {homePref && (
              <Chip active={neighborActive} onClick={onToggleNeighbor}>
                <MapPin size={12} /> 近隣（{homePref}）
              </Chip>
            )}
            {regions.map((r) => (
              <Chip key={r.key} active={selectedRegions.has(r.key)} onClick={() => onToggleRegion(r.key)}>
                {r.label} <span className="opacity-60">{r.count}</span>
              </Chip>
            ))}

            {/* 都道府県は折りたたみ＋地方ごとにグルーピング（既定は地方チップだけでスッキリ） */}
            {prefGroups.length > 0 && (
              <div className="w-full mt-1">
                <button
                  onClick={() => setPrefOpen((o) => !o)}
                  className="pressable flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}
                >
                  都道府県で絞る
                  {selectedPrefs.size > 0 && <span style={{ color: 'var(--accent-text)' }}>{selectedPrefs.size}</span>}
                  <ChevronDown size={14} className={`transition-transform ${prefOpen ? 'rotate-180' : ''}`} />
                </button>
                {prefOpen && (
                  <div className="mt-2 flex flex-col gap-2">
                    {prefGroups.map((g) => (
                      <div key={g.region}>
                        <div className="text-[11px] text-label-tertiary mb-1">{g.region}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {g.prefs.map((p) => (
                            <Chip key={p.key} active={selectedPrefs.has(p.key)} onClick={() => onTogglePref(p.key)}>
                              {p.label} <span className="opacity-60">{p.count}</span>
                            </Chip>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-subtle">
        <button onClick={onClear} className="text-[13px] text-label-secondary pressable">クリア</button>
        <span className="text-[13px] font-semibold" style={{ color: 'var(--accent-text)' }}>{resultCount}件</span>
      </div>
    </div>
  );
}
