import { fireEvent, render, screen } from "@testing-library/react";
import { CutoffControl } from "../components/CutoffControl";

describe("CutoffControl", () => {
  it("renders the three presets plus a custom entry with the current value checked", () => {
    render(<CutoffControl value="09:00" onChange={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "09:00" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Custom" })).not.toBeChecked();
  });

  it("reports a preset selection", () => {
    const onChange = vi.fn();
    render(<CutoffControl value="09:00" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "08:00" }));
    expect(onChange).toHaveBeenCalledWith("08:00");
  });

  it("offers a default custom time when switching to custom", () => {
    const onChange = vi.fn();
    render(<CutoffControl value="09:20" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    expect(onChange).toHaveBeenCalledWith("10:00");
  });

  it("reports a typed custom time and ignores incomplete input", () => {
    const onChange = vi.fn();
    render(<CutoffControl value="10:30" onChange={onChange} />);
    const input = screen.getByLabelText("Custom cutoff time in Europe/London");
    expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
    fireEvent.change(input, { target: { value: "11:45" } });
    expect(onChange).toHaveBeenCalledWith("11:45");
    fireEvent.change(input, { target: { value: "11:" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
