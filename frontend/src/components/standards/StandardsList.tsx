import { useState, useMemo, useEffect } from 'react';
import type { StandardItem, ReadinessLevel } from '../../types/evidence';
import { SectionAccordion } from './SectionAccordion';
import { AmendStandardModal } from '../AmendStandardModal';

interface StandardsListProps {
  standards: StandardItem[];
  onStandardClick: (standardId: string) => void;
  selectedYear: string | null;
}

type FilterValue = 'all' | ReadinessLevel | 'no_evidence' | 'needs_review' | 'needs_revision';

// Map section IDs to titles
const sectionTitles: Record<string, string> = {
  A1: 'Eligibility Requirements',
  A2: 'Admission Requirements',
  A3: 'Personnel Requirements',
  B1: 'Program Organization',
  B2: 'Curriculum',
  B3: 'Clinical Education',
  B4: 'Student Services',
  C1: 'Student Progress',
  C2: 'Fair Practices',
  C3: 'Resources',
  C4: 'Provisional Standards',
  D1: 'Self-Study',
  D2: 'Ongoing Review',
  E1: 'Program and Sponsoring Institution Responsibilities'
};

// Top-level section groupings
const sectionGroups: Record<string, { title: string; sections: string[] }> = {
  A: { title: 'Section A - Program Sponsorship and Resources', sections: ['A1', 'A2', 'A3'] },
  B: { title: 'Section B - Program Curriculum', sections: ['B1', 'B2', 'B3', 'B4'] },
  C: { title: 'Section C - Evaluation', sections: ['C1', 'C2', 'C3', 'C4'] },
  D: { title: 'Section D - Provisional Accreditation', sections: ['D1', 'D2'] },
  E: { title: 'Section E - Accreditation Maintenance', sections: ['E1']}
};

export function StandardsList({ standards, onStandardClick, selectedYear }: StandardsListProps) {
  // Amendment modal state
  const [amendModalOpen, setAmendModalOpen] = useState(false);
  const [amendingStandard, setAmendingStandard] = useState<StandardItem | null>(null);
  const [amendedStandards, setAmendedStandards] = useState<Set<string>>(new Set());
  const [refrozenStandards, setRefrozenStandards] = useState<Set<string>>(new Set());

  // 1. Initialize state from sessionStorage (or fall back to defaults)
  const [searchQuery, setSearchQuery] = useState(() => 
    sessionStorage.getItem('std_search') || ''
  );
  
  const [filter, setFilter] = useState<FilterValue>(() => 
    (sessionStorage.getItem('std_filter') as FilterValue) || 'all'
  );
  
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('std_expanded_groups');
      return saved ? new Set(JSON.parse(saved)) : new Set(['A', 'B', 'C', 'D']);
    } catch {
      return new Set(['A', 'B', 'C', 'D']);
    }
  });

  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('std_expanded_sections');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // 2. Sync state changes TO sessionStorage
  useEffect(() => {
    sessionStorage.setItem('std_search', searchQuery);
    sessionStorage.setItem('std_filter', filter);
    sessionStorage.setItem('std_expanded_groups', JSON.stringify(Array.from(expandedGroups)));
    sessionStorage.setItem('std_expanded_sections', JSON.stringify(Array.from(expandedSections)));
  }, [searchQuery, filter, expandedGroups, expandedSections]);

  // 3. Restore window scroll position on mount
  useEffect(() => {
    const savedScroll = sessionStorage.getItem('std_scroll');
    if (savedScroll) {
      // A tiny timeout ensures the browser has painted the restored accordions before scrolling
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedScroll, 10));
      }, 50);
    }
  }, []);

  // 4. Intercept the click to save scroll position right before navigating away
  const handleStandardClick = (standardId: string) => {
    sessionStorage.setItem('std_scroll', window.scrollY.toString());
    onStandardClick(standardId);
  };

  // Group standards by section
  const groupedStandards = useMemo(() => {
    const groups: Record<string, StandardItem[]> = {};
    for (const std of standards) {
      if (!groups[std.section_id]) {
        groups[std.section_id] = [];
      }
      groups[std.section_id].push(std);
    }
    // Sort within each group by standard_id
    for (const section of Object.keys(groups)) {
      groups[section].sort((a, b) => a.standard_id.localeCompare(b.standard_id));
    }
    return groups;
  }, [standards]);

  // Filter standards
  const filteredGroups = useMemo(() => {
    const result: Record<string, StandardItem[]> = {};
    const query = searchQuery.toLowerCase();

    for (const [section, stds] of Object.entries(groupedStandards)) {
      const filtered = stds.filter((std) => {
        // Search filter
        if (query && !std.standard_id.toLowerCase().includes(query) &&
            !std.requirement_text.toLowerCase().includes(query)) {
          return false;
        }

        // Status filter
        if (filter === 'all') return true;
        const readiness = std.overall_readiness ?? std.evidence_data?.overall_readiness;
        const humanStatus = std.human_review_status ?? std.evidence_data?.human_review_status;

        if (filter === 'no_evidence') {
          return std.status !== 'analysis_complete' || !readiness;
        }
        if (filter === 'needs_review') {
          // Show standards awaiting first review (not yet reviewed or in progress)
          return std.status === 'analysis_complete' && readiness &&
                 (humanStatus === 'needs_review' || humanStatus === 'review_in_progress');
        }
        if (filter === 'needs_revision') {
          // Show standards that were reviewed and marked as needing revision
          return humanStatus === 'needs_revision';
        }

        // Filter by readiness (use human assessment if available)
        const finalReadiness = std.human_readiness_assessment ?? std.evidence_data?.human_readiness_assessment ?? readiness;
        return finalReadiness === filter;
      });

      if (filtered.length > 0) {
        result[section] = filtered;
      }
    }
    return result;
  }, [groupedStandards, searchQuery, filter]);

  // Calculate stats
  const stats = useMemo(() => {
    const result = {
      total: standards.length,
      ready: 0,
      mostly_ready: 0,
      needs_work: 0,
      not_ready: 0,
      no_guidance: 0,
      no_evidence: 0,
      needs_review: 0,
      needs_revision: 0,
    };

    for (const std of standards) {
      const readiness = std.overall_readiness ?? std.evidence_data?.overall_readiness;
      const humanStatus = std.human_review_status ?? std.evidence_data?.human_review_status;

      if (std.status !== 'analysis_complete' || !readiness) {
        result.no_evidence++;
        continue;
      }

      // Count by human review status
      if (humanStatus === 'needs_review' || humanStatus === 'review_in_progress') {
        result.needs_review++;
      } else if (humanStatus === 'needs_revision') {
        result.needs_revision++;
      }

      // Count by readiness (use human assessment if available, otherwise AI)
      const finalReadiness = std.human_readiness_assessment ?? std.evidence_data?.human_readiness_assessment ?? readiness;
      if (finalReadiness in result) {
        result[finalReadiness as keyof typeof result]++;
      }
    }
    return result;
  }, [standards]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedGroups(new Set(['A', 'B', 'C', 'D', 'E']));
    setExpandedSections(new Set(Object.keys(filteredGroups)));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
    setExpandedSections(new Set());
  };

  const filterTabs: { value: FilterValue; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: stats.total },
    { value: 'needs_review', label: 'Needs Review', count: stats.needs_review },
    { value: 'needs_revision', label: 'Needs Revision', count: stats.needs_revision },
    { value: 'ready', label: 'Ready', count: stats.ready },
    { value: 'mostly_ready', label: 'Mostly Ready', count: stats.mostly_ready },
    { value: 'needs_work', label: 'Needs Work', count: stats.needs_work },
    { value: 'not_ready', label: 'Not Ready', count: stats.not_ready },
    { value: 'no_evidence', label: 'No Evidence', count: stats.no_evidence },
  ];

  const visibleCount = Object.values(filteredGroups).reduce((sum, stds) => sum + stds.length, 0);

  const handleAmendSuccess = (standardId: string) => {
    setAmendedStandards((prev) => new Set(prev).add(standardId));
    setRefrozenStandards((prev) => {
      const next = new Set(prev);
      next.delete(standardId);
      return next;
    });
  };

  const closeAmendModal = () => {
    setAmendModalOpen(false);
    setAmendingStandard(null);
  };

  const openAmendModal = (standard: StandardItem) => {
    setAmendingStandard(standard);
    setAmendModalOpen(true);
  };

  return (
    <div>
      {/* Frozen year banner */}
      {selectedYear !== null && (
        <div
          className="flex items-center gap-3 rounded-lg border px-5 py-3 mb-5"
          style={{ borderColor: '#bfdbfe', background: '#eff6ff' }}
        >
          <span className="text-sm font-medium" style={{ color: '#1d4ed8' }}>
            Viewing frozen snapshot:
          </span>
          <span
            className="text-sm font-semibold px-2 py-0.5 rounded"
            style={{ background: '#dbeafe', color: '#1e40af' }}
          >
            {selectedYear}
          </span>
          <span className="text-xs text-[#64748b]">
            — standards from frozen year; use "Amend Standard" to unlock for editing
          </span>
        </div>
      )}

      {/* Pill D.2 - Temporarily disable amend feature UI (for potential reimplementation later) */}
      {false && selectedYear !== null && (
        <AmendStandardModal
          isOpen={amendModalOpen}
          standard={amendingStandard}
          auditYear={selectedYear || ''}
          onClose={closeAmendModal}
          onAmendSuccess={handleAmendSuccess}
        />
      )}

      {/* Stats Summary */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <StatCard label="Needs Review" value={stats.needs_review} variant="needs_review" />
        <StatCard label="Needs Revision" value={stats.needs_revision} variant="needs_revision" />
        <StatCard label="Ready" value={stats.ready + stats.mostly_ready} variant="ready" />
        <StatCard label="Needs Work" value={stats.needs_work} variant="needs_work" />
        <StatCard label="Not Ready" value={stats.not_ready} variant="not_ready" />
        <StatCard label="Total" value={stats.total} variant="default" />
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Search by code or text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filterTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-md border transition-colors
              ${filter === tab.value
                ? 'bg-accent text-white border-accent'
                : 'bg-white text-text-secondary border-border hover:border-accent hover:text-accent'}
            `}
          >
            {tab.label}
            <span className="ml-1.5 text-xs opacity-70">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Expand/Collapse Controls */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-text-muted">
          Showing {visibleCount} of {stats.total} standards
        </span>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="px-3 py-1 text-xs font-medium text-text-secondary border border-border rounded hover:border-accent hover:text-accent transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1 text-xs font-medium text-text-secondary border border-border rounded hover:border-accent hover:text-accent transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Section Groups */}
      <div className="space-y-4">
        {Object.entries(sectionGroups).map(([groupId, group]) => {
          // Get sections in this group that have filtered standards
          const groupSections = group.sections.filter(s => filteredGroups[s]);
          if (groupSections.length === 0) return null;

          const isGroupExpanded = expandedGroups.has(groupId);

          // Count standards in this group
          const groupStandardCount = groupSections.reduce(
            (sum, s) => sum + (filteredGroups[s]?.length || 0), 0
          );

          return (
            <div key={groupId} className="bg-white border border-border rounded-lg overflow-hidden">
              {/* Group Header */}
              <button
                data-testid={`group-header-${groupId}`}
                onClick={() => toggleGroup(groupId)}
                className="w-full flex items-center justify-between px-4 py-3 bg-accent/5 hover:bg-accent/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-display text-lg font-semibold text-accent">
                    {group.title}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-text-muted">
                    {groupStandardCount} standard{groupStandardCount !== 1 ? 's' : ''}
                  </span>
                  <svg
                    className={`w-5 h-5 text-accent transition-transform ${isGroupExpanded ? '' : '-rotate-90'}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </button>

              {/* Group Content - Sections */}
              {isGroupExpanded && (
                <div className="p-3 space-y-2">
                  {groupSections.map(sectionId => (
                    <SectionAccordion
                      key={sectionId}
                      sectionId={sectionId}
                      sectionTitle={sectionTitles[sectionId] || sectionId}
                      standards={filteredGroups[sectionId]}
                      isExpanded={expandedSections.has(sectionId)}
                      onToggle={() => toggleSection(sectionId)}
                      onStandardClick={handleStandardClick}
                      selectedYear={selectedYear}
                      onAmendStandard={openAmendModal}
                      amendedStandards={amendedStandards}
                      refrozenStandards={refrozenStandards}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(filteredGroups).length === 0 && (
        <div className="text-center py-12 bg-bg-secondary rounded-lg">
          <p className="text-text-muted">No standards match your search.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, variant }: { label: string; value: number; variant: 'ready' | 'needs_work' | 'not_ready' | 'needs_review' | 'needs_revision' | 'default' }) {
  const textColors = {
    ready: 'text-found',
    needs_work: 'text-partial',
    not_ready: 'text-missing',
    needs_review: 'text-yellow-700',
    needs_revision: 'text-orange-700',
    default: 'text-text-primary',
  };

  return (
    <div className="bg-white border border-border rounded-lg px-4 py-3 min-w-[120px] shadow-sm">
      <div className={`font-display text-2xl font-semibold ${textColors[variant]}`}>
        {value}
      </div>
      <div className="text-xs font-medium text-text-muted uppercase tracking-wide mt-0.5">
        {label}
      </div>
    </div>
  );
}