import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";

export interface ApiQuery<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  retry: () => void;
}

// Fetches through the given fetcher and exposes loading, error, and retry.
// Callers pass a memoized fetcher (useCallback) so the effect refetches only
// when the request inputs actually change.
export function useApi<T>(fetcher: () => Promise<T>): ApiQuery<T> {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ data: null, error: null, loading: true });
    fetcher().then(
      (data) => {
        if (active) {
          setState({ data, error: null, loading: false });
        }
      },
      (cause: unknown) => {
        if (active) {
          const error =
            cause instanceof ApiError ? cause : new ApiError(0, `Unexpected error: ${String(cause)}`);
          setState({ data: null, error, loading: false });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [fetcher, attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  return { ...state, retry };
}
