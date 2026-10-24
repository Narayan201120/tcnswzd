import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Recharts measures its container with ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
);
