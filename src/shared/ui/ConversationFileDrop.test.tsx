/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { createPortal } from "react-dom";
import { ConversationFileDropProvider, FileDropOverlay, useConversationFileDropReceiver, useConversationFileDropTarget, useFileDropTarget, useFileDropSurfaceHost } from "./ConversationFileDrop";

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

type SurfaceHost = "center" | "marked-shell" | "unmarked-shell" | "none";

function SurfaceColumn({ host, enabled }: { host: SurfaceHost; enabled: boolean }) {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const receiver = React.useMemo(() => ({ enabled, resetKey: "chat-a", onDrop: () => {} }), [enabled]);
  const target = useFileDropTarget(receiver);
  const surfaceHost = useFileDropSurfaceHost(anchorRef, target.active);
  const hint = target.active
    ? <FileDropOverlay variant={surfaceHost ? "surface" : "field"} title="Drop files" hint="Multiple files" />
    : null;
  const anchor = <div ref={anchorRef} data-testid="anchor" {...target.handlers}>anchor</div>;
  const portaled = surfaceHost && hint ? createPortal(hint, surfaceHost) : null;
  const body = host === "center"
    ? <div className="app-shell-center" data-testid="center">{anchor}{portaled}</div>
    : host === "marked-shell"
      ? <div className="app-shell" data-file-drop-surface="" data-testid="shell">
        <div data-testid="top-nav">top nav</div>
        {anchor}
        {portaled}
      </div>
      : host === "unmarked-shell"
        ? <div className="app-shell" data-testid="shell">{anchor}{portaled ? null : hint}</div>
        : <div data-testid="plain">{anchor}{portaled ? null : hint}</div>;
  return <>
    <span data-testid="host-kind" data-kind={surfaceHost?.getAttribute("data-testid") || "none"} />
    {body}
  </>;
}

describe("conversation file drop column hint", () => {
  let container: HTMLDivElement;
  let root: Root;
  const render = (host: SurfaceHost = "center", enabled = true) => act(() => {
    root.render(<SurfaceColumn host={host} enabled={enabled} />);
  });
  const drag = (type: string) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files: [new File(["data"], "test.txt")], dropEffect: "" } });
    act(() => { container.querySelector('[data-testid="anchor"]')!.dispatchEvent(event); });
    return event;
  };
  const hintHost = () => container.querySelector('[data-testid="host-kind"]')?.getAttribute("data-kind");
  const columnText = () => container.querySelector('[data-testid="center"]')?.textContent || "";
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("covers the whole conversation column while a file drag is active", () => {
    render();
    expect(columnText()).not.toContain("Drop files");
    drag("dragenter");
    expect(hintHost()).toBe("center");
    expect(columnText()).toContain("Drop files");
    expect(columnText()).toContain("Multiple files");
    drag("dragleave");
    expect(columnText()).not.toContain("Drop files");
    expect(hintHost()).toBe("none");
  });

  it("keeps the hint on the composer frame without a conversation column", () => {
    render("none");
    drag("dragenter");
    expect(hintHost()).toBe("none");
    expect(container.querySelector('[data-testid="plain"]')?.textContent).toContain("Drop files");
  });

  it("covers the whole marked app shell on route shells without a column", () => {
    render("marked-shell");
    drag("dragenter");
    expect(hintHost()).toBe("shell");
    const shell = container.querySelector('[data-testid="shell"]')!;
    expect(shell.textContent).toContain("Drop files");
    expect(container.querySelector('[data-testid="top-nav"]')?.textContent).toBe("top nav");
  });

  it("does not widen the hint onto an unmarked shell", () => {
    render("unmarked-shell");
    drag("dragenter");
    expect(hintHost()).toBe("none");
    expect(container.querySelector('[data-testid="shell"]')?.textContent).toContain("Drop files");
  });

  it("shows no hint when the composer frame is disabled", () => {
    render("center", false);
    drag("dragenter");
    expect(container.textContent).not.toContain("Drop files");
  });
});

function NestedSurface() {
  const target = useConversationFileDropTarget();
  return <div data-testid="stage" {...target.handlers} />;
}

function ColumnWithStage({ onDrop }: { onDrop: React.DragEventHandler<HTMLElement> }) {
  const receiver = React.useMemo(() => ({ enabled: true, resetKey: "chat-a", onDrop }), [onDrop]);
  const anySurfaceActive = useConversationFileDropReceiver(receiver);
  const target = useConversationFileDropTarget();
  return <div data-testid="column" data-active={String(anySurfaceActive)} {...target.handlers}>
    <NestedSurface />
  </div>;
}

describe("conversation file drop nested surfaces", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onDrop = jest.fn();
  const drag = (type: string, id = "stage") => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files: [new File(["data"], "test.txt")], dropEffect: "" } });
    act(() => { container.querySelector(`[data-testid="${id}"]`)!.dispatchEvent(event); });
    return event;
  };
  const active = () => container.querySelector('[data-testid="column"]')!.getAttribute("data-active");
  beforeEach(() => {
    onDrop.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<ConversationFileDropProvider><ColumnWithStage onDrop={onDrop} /></ConversationFileDropProvider>); });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("keeps the hint on while any nested surface is still dragged over", () => {
    drag("dragenter", "stage");
    drag("dragenter", "column");
    drag("dragleave", "stage");
    expect(active()).toBe("true");
    drag("dragleave", "column");
    expect(active()).toBe("false");
  });

  it("uploads once when the drop lands on a nested surface", () => {
    drag("dragenter");
    drag("drop");
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(active()).toBe("false");
  });

  it("uploads when the drop lands on the column itself", () => {
    drag("dragenter");
    drag("drop", "column");
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(active()).toBe("false");
  });
});

function RouteShell({ onDrop }: { onDrop: React.DragEventHandler<HTMLElement> }) {
  const receiver = React.useMemo(() => ({ enabled: true, resetKey: "chat-a", onDrop }), [onDrop]);
  const anySurfaceActive = useConversationFileDropReceiver(receiver);
  const target = useConversationFileDropTarget();
  return <div data-testid="shell" data-file-drop-surface="" data-active={String(anySurfaceActive)} {...target.handlers}>
    <div data-testid="top-nav">top nav</div>
    <NestedSurface />
  </div>;
}

describe("conversation file drop route shell", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onDrop = jest.fn();
  const drag = (type: string, id = "shell") => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files: [new File(["data"], "test.txt")], dropEffect: "" } });
    act(() => { container.querySelector(`[data-testid="${id}"]`)!.dispatchEvent(event); });
    return event;
  };
  const active = () => container.querySelector('[data-testid="shell"]')!.getAttribute("data-active");
  beforeEach(() => {
    onDrop.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<ConversationFileDropProvider><RouteShell onDrop={onDrop} /></ConversationFileDropProvider>); });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("highlights the composer when the drag enters any shell region", () => {
    drag("dragenter", "top-nav");
    expect(active()).toBe("true");
    drag("dragleave", "top-nav");
    expect(active()).toBe("false");
  });

  it("uploads once for a drop outside the timeline and composer", () => {
    drag("dragenter", "top-nav");
    drag("drop", "top-nav");
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(active()).toBe("false");
  });

  it("still uploads once when the drop lands on the composer frame", () => {
    drag("dragenter", "shell");
    drag("drop", "shell");
    expect(onDrop).toHaveBeenCalledTimes(1);
  });
});
