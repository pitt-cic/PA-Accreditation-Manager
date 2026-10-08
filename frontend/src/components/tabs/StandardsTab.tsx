import { useState } from 'react';
import { useAuditYear } from '../../contexts/AuditYearContext';
import type { StandardItem } from '../../types/evidence';
import { StandardsList } from '../standards/StandardsList';
import { ExportTab } from './ExportTab';

interface StandardsTabProps {
  standards: StandardItem[];
  onStandardClick: (id: string) => void;
}

const SUB_TABS = [
  { id: 'list' as const, label: 'Standards' },
  { id: 'export' as const, label: 'Export' },
];

export function StandardsTab({ standards, onStandardClick }: StandardsTabProps) {
  const { selectedYear } = useAuditYear();
  const [subTab, setSubTab] = useState<'list' | 'export'>('list');

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-[#e2e8f0]">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className="px-4 py-2 text-sm font-medium transition-colors focus:outline-none"
            style={{
              color: subTab === t.id ? '#1a2c4e' : '#64748b',
              borderBottom: subTab === t.id ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'list' && (
        <StandardsList
          standards={standards}
          onStandardClick={onStandardClick}
          selectedYear={selectedYear}
        />
      )}

      {subTab === 'export' && <ExportTab />}
    </div>
  );
}
