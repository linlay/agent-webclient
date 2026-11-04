/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReferenceCard } from "./ReferenceCard";
import { t } from "@/shared/i18n";

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
    expect(button.classList.contains("attachment-card-remove")).toBe(true);
    expect(button.getAttribute("aria-label")).toBe(t("attachments.remove", { name: "技能创建" }));
    expect(button.title).toBe(t("attachments.removeTitle"));
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      button.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it.each(["composer", "timeline"] as const)("uses shared attachment card variant and interaction classes in %s", async (variant) => {
    await act(async () => root.render(React.createElement(ReferenceCard, {
      reference: { id: "skill-creator", name: "技能创建", type: "skill" },
      variant, openTarget: open, onRemove: jest.fn(),
    })));
    const card = container.querySelector('[data-reference-type="skill"]') as HTMLElement;
    expect(card.classList.contains("attachment-card")).toBe(true);
    expect(card.classList.contains(`attachment-card-${variant}`)).toBe(true);
    expect(card.classList.contains("attachment-card-compact")).toBe(false);
    expect(card.classList.contains("attachment-card-default")).toBe(false);
    expect(card.classList.contains("is-interactive")).toBe(true);
    expect(card.querySelector(".attachment-card-file-shell")).not.toBeNull();
    const remove = card.querySelector(".attachment-card-remove") as HTMLButtonElement;
    expect(remove.parentElement).toBe(card);
    expect(remove.getAttribute("type")).toBe("button");
    await act(async () => card.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })));
    expect(open).toHaveBeenCalledTimes(1);
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
