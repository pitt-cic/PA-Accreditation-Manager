import type { ReadinessLevel, EvidenceStatus, ProcessingStatus, HumanReviewStatus } from '../../types/evidence';

type BadgeVariant = ReadinessLevel | EvidenceStatus | ProcessingStatus | HumanReviewStatus | 'default' | 'no_courses_found' | 'not_applicable';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  prefix?: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  // Readiness levels
  ready: 'bg-found-bg text-found border-found-border',
  mostly_ready: 'bg-found-bg text-found border-found-border',
  needs_work: 'bg-partial-bg text-partial border-partial-border',
  not_ready: 'bg-missing-bg text-missing border-missing-border',
  no_guidance: 'bg-bg-secondary text-text-muted border-border',
  no_courses_found: 'bg-bg-secondary text-text-muted border-border',
  not_applicable: 'bg-bg-secondary text-text-muted border-border',
  // Evidence status
  found: 'bg-found-bg text-found border-found-border',
  partial: 'bg-partial-bg text-partial border-partial-border',
  not_found: 'bg-missing-bg text-missing border-missing-border',
  on_site: 'bg-onsite-bg text-onsite border-onsite-border',
  // Processing status
  unprocessed: 'bg-bg-secondary text-text-muted border-border',
  analyzing: 'bg-primary-100 text-primary-700 border-primary-300',
  analysis_complete: 'bg-found-bg text-found border-found-border',
  reevaluating: 'bg-blue-100 text-blue-700 border-blue-300',
  error: 'bg-missing-bg text-missing border-missing-border',
  // Human review status
  needs_review: 'bg-yellow-50 text-yellow-700 border-yellow-300',
  review_in_progress: 'bg-blue-50 text-blue-700 border-blue-300',
  human_verified: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  needs_revision: 'bg-orange-50 text-orange-700 border-orange-300',
  // Default
  default: 'bg-bg-secondary text-text-secondary border-border',
};

const variantLabels: Record<BadgeVariant, string> = {
  ready: 'Ready',
  mostly_ready: 'Mostly Ready',
  needs_work: 'Needs Work',
  not_ready: 'Not Ready',
  no_guidance: 'No Guidance',
  no_courses_found: 'No Courses Found',
  not_applicable: 'Not Applicable',
  found: 'Found',
  partial: 'Partial',
  not_found: 'Not Found',
  on_site: 'On-Site',
  unprocessed: 'Unprocessed',
  analyzing: 'Analyzing',
  analysis_complete: 'Analysis Complete',
  reevaluating: 'Reevaluating',
  error: 'Error',
  needs_review: 'Needs Review',
  review_in_progress: 'In Progress',
  human_verified: 'Verified',
  needs_revision: 'Needs Revision',
  default: '',
};

export function Badge({ variant, children, size = 'md', className = '', prefix }: BadgeProps) {
  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-[10px]'
    : 'px-2 py-1 text-xs';

  return (
    <span
      className={`
        inline-flex items-center gap-1 font-semibold uppercase tracking-wide
        rounded border ${sizeClasses}
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {prefix}
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  size = 'md',
  prefix
}: {
  status: BadgeVariant;
  size?: 'sm' | 'md';
  prefix?: React.ReactNode;
}) {
  return (
    <Badge variant={status} size={size} prefix={prefix}>
      {variantLabels[status]}
    </Badge>
  );
}

export function StatusDot({ status }: { status: BadgeVariant }) {
  const dotColors: Record<BadgeVariant, string> = {
    ready: 'bg-found',
    mostly_ready: 'bg-found',
    needs_work: 'bg-partial',
    not_ready: 'bg-missing',
    no_guidance: 'bg-text-muted',
    no_courses_found: 'bg-text-muted',
    not_applicable: 'bg-text-muted',
    found: 'bg-found',
    partial: 'bg-partial',
    not_found: 'bg-missing',
    on_site: 'bg-onsite',
    unprocessed: 'bg-text-muted',
    analyzing: 'bg-primary-500',
    analysis_complete: 'bg-found',
    reevaluating: 'bg-blue-500',
    error: 'bg-missing',
    needs_review: 'bg-yellow-500',
    review_in_progress: 'bg-blue-500',
    human_verified: 'bg-emerald-500',
    needs_revision: 'bg-orange-500',
    default: 'bg-border-dark',
  };

  return (
    <span className={`w-2 h-2 rounded-full ${dotColors[status]}`} />
  );
}
