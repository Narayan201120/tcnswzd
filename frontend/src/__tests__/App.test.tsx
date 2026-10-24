import { render, screen } from "@testing-library/react";
import App from "../App";

vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    health: () => new Promise(() => {}),
    latestForecast: () => new Promise(() => {}),
    accuracySummary: () => new Promise(() => {}),
    revisions: () => new Promise(() => {}),
  },
}));

describe("App shell", () => {
  it("renders the header, the three view tabs, and loading states while requests hang", () => {
    render(<App />);
    expect(screen.getByText("WindLens")).toBeInTheDocument();
    expect(screen.getByText("Day-ahead wind forecast clarity and accuracy")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Decision" })).toHaveAttribute("href", "#/decision");
    expect(screen.getByRole("link", { name: "Accuracy" })).toHaveAttribute("href", "#/accuracy");
    expect(screen.getByRole("link", { name: "Buying notes" })).toHaveAttribute("href", "#/buying-notes");
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument();
  });
});
