/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReferenceCard } from "./ReferenceCard";

const open = jest.fn();

describe("skill reference activation", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("opens the right sidebar skill detail on click", async () => {
    await act(async () => root.render(
      React.createElement(ReferenceCard, {
        reference: { id: "skill-creator", name: "技能创建", type: "skill" },
        variant: "composer", openTarget: open,
      }),
    ));
    const card = container.querySelector('[data-reference-type="skill"]') as HTMLElement;
    expect(card.getAttribute("role")).toBe("button");
    await act(async () => card.click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenLastCalledWith({
      version: 1,
      kind: "skill",
      id: "skill-creator",
      label: "技能创建",
    });
  });

  it("supports opening with the keyboard", async () => {
    await act(async () => root.render(
      React.createElement(ReferenceCard, {
        reference: { id: "doc-writer", name: "文档写作", type: "skill" },
        variant: "timeline", openTarget: open,
      }),
    ));
    const card = container.querySelector('[data-reference-type="skill"]') as HTMLElement;
    await act(async () => card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "skill", id: "doc-writer" }));
  });

  it("keeps remove working without triggering the skill viewer", async () => {
    const remove = jest.fn();
    await act(async () => root.render(
      React.createElement(ReferenceCard, {
        reference: { id: "skill-creator", name: "技能创建", type: "skill" },
        variant: "composer", openTarget: open,
        onRemove: remove,
      }),
    ));
    const button = container.querySelector("button")!;
    await act(async () => {
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      button.click();
    });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it("does not make non-skill references openable", async () => {
    await act(async () => root.render(
      React.createElement(ReferenceCard, {
        reference: { id: "lib-a", name: "资料库", type: "kbase" },
        variant: "timeline", openTarget: open,
      }),
    ));
    const card = container.querySelector('[data-reference-type="kbase"]') as HTMLElement;
    expect(card.getAttribute("role")).toBeNull();
    await act(async () => card.click());
    expect(open).not.toHaveBeenCalled();
  });
});
