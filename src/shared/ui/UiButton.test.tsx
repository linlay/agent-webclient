/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { UiButton } from "./UiButton";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("UiButton color", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function renderButton(props: React.ComponentProps<typeof UiButton>) {
    act(() => root.render(<UiButton {...props}>保存</UiButton>));
    return host.querySelector("button")!;
  }

  it("keeps the skin palette when color is omitted or default", () => {
    expect(renderButton({}).className).toBe("ui-btn ui-btn-secondary ui-btn-md");
    expect(renderButton({ color: "default" }).className).toBe("ui-btn ui-btn-secondary ui-btn-md");
  });

  it.each([
    ["accent", "ui-btn-color-accent"],
    ["success", "ui-btn-color-success"],
    ["warning", "ui-btn-color-warning"],
    ["danger", "ui-btn-color-danger"],
  ] as const)("emits the %s tone next to variant and size", (color, toneClass) => {
    const button = renderButton({ color, variant: "primary", size: "sm" });
    expect(button.className).toBe(`ui-btn ui-btn-primary ui-btn-sm ui-btn-tone ${toneClass}`);
  });

  it("does not leak color onto the DOM element", () => {
    const button = renderButton({ color: "success" });
    expect(button.hasAttribute("color")).toBe(false);
    expect(button.textContent).toBe("保存");
  });

  it("keeps active, loading and disabled states alongside the tone", () => {
    const button = renderButton({ color: "warning", active: true, disabled: true });
    expect(button.className).toContain("ui-btn-color-warning");
    expect(button.className).toContain("is-active");
    expect(button.disabled).toBe(true);
  });
});
