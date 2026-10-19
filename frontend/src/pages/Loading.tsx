export function BoardSkeleton({ label = "Загружаем расписание", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="card morph-target loading-board" role="status" aria-live="polite">
      <div className="loading-head">
        <span className="morph-blob" aria-hidden="true" />
        <span className="loading-label">{label}</span>
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="loading-row" aria-hidden="true" style={{ animationDelay: `${index * 120}ms` }}>
          <span className="loading-time" />
          <span className="loading-bar" />
        </div>
      ))}
    </div>
  );
}

export function RoutesSkeleton() {
  return (
    <div className="pill-group morph-routes" role="status" aria-live="polite">
      <span className="clip">Загружаем маршруты</span>
      <div className="pill-grid">
        {Array.from({ length: 16 }, (_, index) => (
          <span key={index} className="pill morph-blob small" aria-hidden="true" style={{ animationDelay: `${index * 60}ms` }} />
        ))}
      </div>
    </div>
  );
}
