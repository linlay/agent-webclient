/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useAuthenticatedResourceUrl } from "./useAuthenticatedResourceUrl";
import { classifyResourceUrl, getResourceBlob } from "@/shared/data";

jest.mock("@/shared/data", () => ({ classifyResourceUrl: jest.fn(), getResourceBlob: jest.fn() }));

it("refreshes one viewer without revoking a second viewer's current Blob", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let sequence = 0;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => `blob:${++sequence}`);
  URL.revokeObjectURL = jest.fn();
  jest.mocked(classifyResourceUrl).mockReturnValue({ kind: "internal", source: "artifacts/image.png" } as never);
  jest.mocked(getResourceBlob).mockResolvedValue(new Blob(["image"], { type: "image/png" }));
  const container = document.createElement("div");
  const root = createRoot(container);
  function Viewer({ refreshKey }: { refreshKey?: string }) {
    const { url } = useAuthenticatedResourceUrl("artifacts/image.png", "chat-1", { refreshKey });
    return React.createElement("img", { src: url });
  }
  const render = async (refreshKey?: string) => {
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(Viewer, { key: "first", refreshKey }), React.createElement(Viewer, { key: "second" }),
    )));
  };
  try {
    await render();
    expect(getResourceBlob).toHaveBeenCalledTimes(1);
    await render("first:1");
    expect(getResourceBlob).toHaveBeenCalledTimes(2);
    expect(Array.from(container.querySelectorAll("img"), (img) => img.getAttribute("src"))).toEqual(["blob:2", "blob:1"]);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await render("first:1");
    expect(getResourceBlob).toHaveBeenCalledTimes(2);
  } finally {
    jest.useFakeTimers();
    await act(async () => root.unmount());
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});

it("renders a warm Blob URL in the first commit after a remount", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let sequence = 0;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => `blob:${++sequence}`);
  URL.revokeObjectURL = jest.fn();
  jest.mocked(classifyResourceUrl).mockReturnValue({ kind: "internal", source: "artifacts/remount.png" } as never);
  jest.mocked(getResourceBlob).mockResolvedValue(new Blob(["image"], { type: "image/png" }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  function Viewer() {
    const { url } = useAuthenticatedResourceUrl("artifacts/remount.png", "chat-remount");
    return url
      ? React.createElement("img", { src: url })
      : React.createElement("span", { "aria-busy": true });
  }
  const trace: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const entry of records) {
      trace.push([
        entry.type,
        `+[${Array.from(entry.addedNodes, (node) => (node as Element).nodeName).join(",")}]`,
        `-[${Array.from(entry.removedNodes, (node) => (node as Element).nodeName).join(",")}]`,
      ].join(" "));
    }
  });
  let root: ReturnType<typeof createRoot> | null = null;
  const fetchBaseline = jest.mocked(getResourceBlob).mock.calls.length;
  try {
    root = createRoot(container);
    await act(async () => root?.render(React.createElement(Viewer)));
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:1");

    await act(async () => root?.unmount());
    observer.observe(container, { childList: true, subtree: true });
    root = createRoot(container);
    await act(async () => root?.render(React.createElement(Viewer)));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(trace.filter((entry) => entry.includes("+[SPAN]"))).toEqual([]);
    expect(trace.some((entry) => entry.includes("+[IMG]"))).toBe(true);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:1");
    expect(jest.mocked(getResourceBlob).mock.calls.length - fetchBaseline).toBe(1);
  } finally {
    observer.disconnect();
    jest.useFakeTimers();
    await act(async () => root?.unmount());
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    container.remove();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
