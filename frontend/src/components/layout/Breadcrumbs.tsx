import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  href: string;
}

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (!crumbs.length) return null;

  return (
    <nav className="flex items-center gap-1.5 text-[11px] text-[#94a3b8] mb-5 flex-wrap">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 && (
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            {isLast ? (
              <span className="font-medium text-[#475569]">{crumb.label}</span>
            ) : (
              <Link
                to={crumb.href}
                className="hover:text-[#2563eb] transition-colors font-medium"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
