// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { UseCaseSettingsInspector } from "./UseCaseSettingsInspector";
import { parseUseCaseSettings } from "./usecase-settings";

afterEach(cleanup);

test("preserves a color draft across equivalent settings updates and commits it on blur", () => {
  const settings = parseUseCaseSettings("@startuml\nactor Customer\n@enduml");
  const onChange = vi.fn();
  const { rerender } = render(<UseCaseSettingsInspector settings={settings} onChange={onChange} onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Actor fill"), { target: { value: "#LightBlue" } });
  rerender(<UseCaseSettingsInspector settings={{ ...settings }} onChange={onChange} onClose={() => {}} />);
  expect((screen.getByLabelText("Actor fill") as HTMLInputElement).value).toBe("#LightBlue");
  fireEvent.blur(screen.getByLabelText("Actor fill"));
  expect(onChange).toHaveBeenLastCalledWith({ ...settings, actorBackgroundColor: "#LightBlue" });
  rerender(
    <UseCaseSettingsInspector
      settings={{ ...settings, actorBackgroundColor: "#Orange" }}
      onChange={onChange}
      onClose={() => {}}
    />,
  );
  expect((screen.getByLabelText("Actor fill") as HTMLInputElement).value).toBe("#Orange");
});
