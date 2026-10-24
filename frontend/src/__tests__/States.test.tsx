import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "../api/client";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/States";

describe("loading, error, and empty states", () => {
  it("renders a labelled loading region", () => {
    render(<LoadingSkeleton label="the summary" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading the summary");
  });

  it("shows the error detail from the API and retries", () => {
    const onRetry = vi.fn();
    render(
      <ErrorState error={new ApiError(503, "January 2026 snapshot is not installed")} onRetry={onRetry} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("January 2026 snapshot is not installed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders an empty state with a next action in the body", () => {
    render(<EmptyState title="No forecast at this cutoff" body="Try an earlier cutoff." />);
    expect(screen.getByText("No forecast at this cutoff")).toBeInTheDocument();
    expect(screen.getByText("Try an earlier cutoff.")).toBeInTheDocument();
  });
});
