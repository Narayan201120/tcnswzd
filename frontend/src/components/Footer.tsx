import { useCallback } from "react";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";

export function Footer() {
  const health = useApi(useCallback(() => api.health(), []));
  return (
    <footer className="app-footer">
      <p>
        Data: January 2026 snapshot, delivery days Jan 2 to Feb 1 2026, built from Elexon BMRS
        FUELHH and WINDFOR.
      </p>
      <p className="footer-status">
        {health.loading
          ? "Checking API status"
          : health.data !== null
            ? `API status: ${health.data.status}`
            : "API status: unavailable"}
      </p>
    </footer>
  );
}
