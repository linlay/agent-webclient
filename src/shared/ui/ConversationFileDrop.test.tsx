/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { ConversationFileDropProvider, FileDropOverlay, useConversationFileDropReceiver, useConversationFileDropTarget, useFileDropTarget } from "./ConversationFileDrop";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Receiver({ enabled, chatId, onDrop }: { enabled: boolean; chatId: string; onDrop: React.DragEventHandler<HTMLElement> }) {
  const receiver = { enabled, resetKey: chatId, onDrop };
  const stageActive = useConversationFileDropReceiver({ ...receiver, onDrop: event => onDrop(event) });
  const target = useFileDropTarget(receiver);
  const highlight = enabled && (target.active || stageActive);
  return <div data-testid="composer" {...target.handlers} data-active={highlight}>
    {highlight && <FileDropOverlay title="Drop files" hint="Multiple files" />}
  </div>;
}
function Stage() {
  const target = useConversationFileDropTarget();
  return <div data-testid="stage" {...target.handlers} data-active={target.active}>
    <span data-testid="child">message</span>
  </div>;
}

describe("conversation file drop", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onDrop = jest.fn();
  const render = (enabled = true, chatId = "chat-a", mounted = true) => act(() => {
    root.render(<ConversationFileDropProvider><Stage />{mounted && <Receiver enabled={enabled} chatId={chatId} onDrop={onDrop} />}</ConversationFileDropProvider>);
  });
  const zone = (id = "stage") => container.querySelector(`[data-testid="${id}"]`)!;
  const drag = (type: string, target = zone(), files = true) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const dataTransfer = { types: files ? ["Files"] : ["text/plain"], files: files ? [new File(["data"], "test.txt")] : [], dropEffect: "" };
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    act(() => { target.dispatchEvent(event); });
    return { event, dataTransfer };
  };
  beforeEach(() => {
    onDrop.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("shares one receiver between message area and composer without automatic sending", () => {
    render();
    drag("dragenter");
    expect(zone().getAttribute("data-active")).toBe("true");
    expect(zone().textContent).not.toContain("Drop files");
    expect(zone("composer").textContent).toContain("Drop files");
    expect(zone("composer").getAttribute("data-active")).toBe("true");
    expect(drag("dragover").dataTransfer.dropEffect).toBe("copy");
    expect(drag("drop").event.defaultPrevented).toBe(true);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(zone().getAttribute("data-active")).toBe("false");
    drag("drop", zone("composer"));
    expect(onDrop).toHaveBeenCalledTimes(2);
  });

  it("keeps highlighting when moving across nested message content", () => {
    render();
    drag("dragenter");
    drag("dragenter", zone("child"));
    drag("dragleave", zone("child"));
    expect(zone().getAttribute("data-active")).toBe("true");
    drag("dragleave");
    expect(zone().getAttribute("data-active")).toBe("false");
  });

  it("does not intercept text drags or drops", () => {
    render();
    for (const type of ["dragenter", "dragover", "dragleave", "drop"]) {
      expect(drag(type, zone(), false).event.defaultPrevented).toBe(false);
    }
    expect(zone().getAttribute("data-active")).toBe("false");
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("blocks file navigation and upload when disabled or the composer unmounts", () => {
    render(false);
    drag("dragenter");
    expect(zone().getAttribute("data-active")).toBe("false");
    expect(drag("dragover").dataTransfer.dropEffect).toBe("none");
    expect(drag("drop").event.defaultPrevented).toBe(true);
    render(true, "chat-a", false);
    drag("drop");
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("clears highlighting on chat switches, disable, cancellation and outside drops", () => {
    render();
    drag("dragenter");
    render(true, "chat-b");
    expect(zone().getAttribute("data-active")).toBe("false");
    drag("dragenter");
    render(false, "chat-b");
    expect(zone().getAttribute("data-active")).toBe("false");
    render();
    for (const type of ["dragend", "drop", "blur"]) {
      drag("dragenter");
      act(() => { window.dispatchEvent(new Event(type)); });
      expect(zone().getAttribute("data-active")).toBe("false");
    }
  });
});
