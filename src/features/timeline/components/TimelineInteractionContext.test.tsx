/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { registerDesktopContextMenuTarget, resolveDesktopContextMenuTargetAt } from "@/shared/data/desktop/desktopContextMenu";
import { TimelineInteractionProvider, useTimelineContextMenuTarget } from "./TimelineInteractionContext";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Message({ id }: { id: string }) {
  const descriptor = React.useMemo(() => ({ targetId: `message:${id}`, kind: "message" as const, handlers: {} }), [id]);
  const ref = useTimelineContextMenuTarget<HTMLDivElement>(descriptor);
  return <div ref={ref}>Selected message text</div>;
}

it("keeps selection targets registered through StrictMode effects, updates, and unmount", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (id: string) => act(() => root.render(
    <React.StrictMode>
      <TimelineInteractionProvider value={{ registerContextMenuTarget: registerDesktopContextMenuTarget }}>
        <Message id={id} />
      </TimelineInteractionProvider>
    </React.StrictMode>,
  ));
  try {
    render("first");
    const element = container.firstElementChild!;
    const targetDocument = { elementFromPoint: () => element };
    expect(resolveDesktopContextMenuTargetAt(0, 0, targetDocument)?.targetId).toBe("message:first");
    render("second");
    expect(resolveDesktopContextMenuTargetAt(0, 0, targetDocument)?.targetId).toBe("message:second");
    act(() => root.render(null));
    expect(resolveDesktopContextMenuTargetAt(0, 0, targetDocument)).toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
