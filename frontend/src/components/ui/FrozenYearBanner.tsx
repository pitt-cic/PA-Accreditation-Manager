interface FrozenYearBannerProps {
  year: string;
}

export function FrozenYearBanner({ year }: FrozenYearBannerProps) {
  return (
    <div
      data-testid="frozen-banner"
      className="flex items-center gap-3 rounded-lg border px-5 py-3"
      style={{ borderColor: '#bfdbfe', background: '#eff6ff' }}
    >
      <span className="text-sm font-medium" style={{ color: '#1d4ed8' }}>
        Viewing frozen data from audit year
      </span>
      <span
        className="text-sm font-semibold px-2 py-0.5 rounded"
        style={{ background: '#dbeafe', color: '#1e40af' }}
      >
        {year}
      </span>
    </div>
  );
}
