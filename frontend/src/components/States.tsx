import type { ApiError } from "../api/client";

export function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="skeleton-block" role="status" aria-label={`Loading ${label}`}>
      <span className="skeleton-line w-60" />
      <span className="skeleton-line w-90" />
      <span className="skeleton-line w-75" />
      <span className="skeleton-line w-40" />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <div role="alert" className="error-state">
      <p className="state-title">Could not load data</p>
      <p className="state-detail">{error.message}</p>
      <button type="button" className="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <p className="state-title">{title}</p>
      <p className="state-detail">{body}</p>
    </div>
  );
}
