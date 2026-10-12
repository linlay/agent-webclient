/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TextEncoder, TextDecoder } from "node:util";
Object.assign(globalThis, { TextEncoder, TextDecoder });
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { useDesktopNativeShare } from "./useDesktopNativeShare";
import { completeDesktopNativeShare, readDesktopNativeShareFiles } from "@/shared/data/desktop/desktopNativeShare";

jest.mock("@/shared/data/desktop/desktopHostBridge", () => ({ hasDesktopHostBridge: () => true }));
jest.mock("@/shared/data/desktop/desktopNativeShare", () => ({
  ...jest.requireActual("@/shared/data/desktop/desktopNativeShare"),
  completeDesktopNativeShare: jest.fn(),
  readDesktopNativeShareFiles: jest.fn(),
}));
const readFiles = readDesktopNativeShareFiles as jest.Mock;
const confirm = completeDesktopNativeShare as jest.Mock;
const batch = "36f00671-a11c-4417-bdfa-502d2a14de3b";
const entry = `/agent/cutej?newChat=1791788400000&shareBatch=${batch}&lang=zh`;

function setup(route = entry) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const stageFiles = jest.fn(() => true);
  let actions!: ReturnType<typeof useDesktopNativeShare>;
  let location!: ReturnType<typeof useLocation>;
  let navigate!: ReturnType<typeof useNavigate>;
  const Harness = () => {
    location = useLocation();
    navigate = useNavigate();
    actions = useDesktopNativeShare({ enabled: true, chatId: "", pendingAgentKey: "cutej", stageFiles });
    return null;
  };
  const root = createRoot(document.createElement("div"));
  const render = () => act(() => root.render(<MemoryRouter initialEntries={[route]}><Harness /></MemoryRouter>));
  return { render, stageFiles, actions: () => actions, location: () => location, navigate: (route: string) => act(() => navigate(route)), unmount: () => act(() => root.unmount()) };
}

beforeEach(() => { readFiles.mockReset(); confirm.mockReset(); });

it("stages once without upload, draft replacement, or completion; confirms only on explicit send", async () => {
  const files = [new File(["PK"], "chat.zip", { type: "application/zip" })];
  readFiles.mockResolvedValue(files);
  confirm.mockResolvedValue(undefined);
  const test = setup();
  try {
    await act(async () => { test.render(); });
    expect(test.stageFiles).toHaveBeenCalledTimes(1);
    expect(test.stageFiles).toHaveBeenCalledWith(files);
    expect(confirm).not.toHaveBeenCalled();
    expect(test.actions().pending).toBe(true);
    expect(test.actions().blocked).toBe(false);
    test.render();
    expect(readFiles).toHaveBeenCalledTimes(1);
    await act(async () => { expect(await test.actions().complete()).toBe(true); });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(test.location().search).toBe("?newChat=1791788400000&lang=zh");
    expect(test.stageFiles).toHaveBeenCalledTimes(1);
  } finally { test.unmount(); }
});

it("retains the share route after a read failure and retries on the same page", async () => {
  readFiles.mockRejectedValueOnce(new Error("temporary I/O failure"));
  readFiles.mockResolvedValue([new File(["PK"], "chat.zip", { type: "application/zip" })]);
  const test = setup();
  try {
    await act(async () => { test.render(); });
    expect(test.actions().error).toBe("temporary I/O failure");
    expect(test.actions().blocked).toBe(true);
    expect(test.location().search).toContain(`shareBatch=${batch}`);
    await act(async () => { test.actions().retry(); });
    expect(test.stageFiles).toHaveBeenCalledTimes(1);
    expect(test.actions().error).toBe("");
    expect(confirm).not.toHaveBeenCalled();
  } finally { test.unmount(); }
});

it("keeps already staged files and URL after confirmation fails, without duplicating attachments on retry", async () => {
  readFiles.mockResolvedValue([new File(["PK"], "chat.zip", { type: "application/zip" })]);
  confirm.mockRejectedValueOnce(new Error("confirmation unavailable"));
  confirm.mockResolvedValue(undefined);
  const test = setup();
  try {
    await act(async () => { test.render(); });
    await act(async () => { expect(await test.actions().complete()).toBe(false); });
    expect(test.location().search).toContain(`shareBatch=${batch}`);
    expect(test.actions().error).toBe("confirmation unavailable");
    await act(async () => { test.actions().retry(); });
    expect(readFiles).toHaveBeenCalledTimes(1);
    expect(test.stageFiles).toHaveBeenCalledTimes(1);
    await act(async () => { expect(await test.actions().complete()).toBe(true); });
    expect(test.location().search).not.toContain("shareBatch");
  } finally { test.unmount(); }
});

it("cancels an old route import and rejects a captured send continuation after navigation", async () => {
  let finish!: (files: File[]) => void;
  readFiles.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const test = setup();
  try {
    test.render();
    const capturedComplete = test.actions().complete;
    const signal = readFiles.mock.calls[0][1] as AbortSignal;
    test.navigate("/agent/cutej?newChat=1791788400001");
    expect(signal.aborted).toBe(true);
    await act(async () => { finish([new File(["PK"], "chat.zip")]); });
    expect(test.stageFiles).not.toHaveBeenCalled();
    await expect(capturedComplete()).resolves.toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  } finally { test.unmount(); }
});
