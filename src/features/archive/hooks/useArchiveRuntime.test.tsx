/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useArchiveRuntime } from "@/features/archive/hooks/useArchiveRuntime";

const mockPushHandlers = new Map<string, Set<() => void>>();
const mockReconnectHandlers = new Set<() => void>();

jest.mock("@/features/transport/hooks/useRefreshSignals", () => ({
  usePushSignal: (type: string, callback: () => void) => {
    let handlers = mockPushHandlers.get(type);
    if (!handlers) {
      handlers = new Set();
      mockPushHandlers.set(type, handlers);
    }
    handlers.add(callback);
  },
  useReconnectSignal: (callback: () => void) => {
    mockReconnectHandlers.add(callback);
  },
}));

const mockGetArchives = jest.fn(async () => ({
  data: { items: [], total: 0 },
}));
const mockGetAgents = jest.fn(async () => ({ data: [] }));

jest.mock("@/shared/data", () => ({
  getArchives: (...args: unknown[]) => mockGetArchives(...args),
  getAgents: (...args: unknown[]) => mockGetAgents(...args),
  searchArchives: jest.fn(),
  getArchive: jest.fn(),
  archiveChats: jest.fn(),
  restoreArchives: jest.fn(),
  deleteArchive: jest.fn(),
}));

jest.mock("antd", () => ({
  Modal: { confirm: jest.fn() },
}));

jest.mock("@/shared/i18n", () => ({
  t: (key: string) => key,
}));

// Stable references matter: the hook memoizes loaders on `dispatch` and the
// state slices, so a fresh object per render would loop the load effect.
const mockState = {
  workerIndexByKey: new Map(),
  workerSelectionKey: "",
  chats: [],
  workerRelatedChats: [],
};
const mockDispatch = jest.fn();

jest.mock("@/app/state/AppContext", () => ({
  useAppContext: () => ({ state: mockState, dispatch: mockDispatch }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe() {
  useArchiveRuntime({ active: true, showAgentFilter: true });
  return null;
}

async function renderProbe() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Probe />);
  });
  // The initial list load is debounced by 180ms.
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
  return root;
}

beforeEach(() => {
  mockPushHandlers.clear();
  mockReconnectHandlers.clear();
  mockGetArchives.mockClear();
  mockGetAgents.mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = "";
});

describe("useArchiveRuntime archive invalidation", () => {
  it("reloads the archive list when a Chat is archived elsewhere", async () => {
    const root = await renderProbe();
    expect(mockGetArchives).toHaveBeenCalledTimes(1);

    const handlers = mockPushHandlers.get("chat.archived");
    expect(handlers?.size).toBeGreaterThan(0);
    await act(async () => {
      handlers?.forEach((handler) => handler());
      jest.advanceTimersByTime(200);
    });

    expect(mockGetArchives).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it("reloads when an archive is restored or deleted in another surface", async () => {
    const root = await renderProbe();

    await act(async () => {
      mockPushHandlers.get("archive.restored")?.forEach((handler) => handler());
      mockPushHandlers.get("archive.deleted")?.forEach((handler) => handler());
      jest.advanceTimersByTime(200);
    });

    // One debounced reload covers both frames.
    expect(mockGetArchives).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it("reloads after a reconnect that may have missed archive pushes", async () => {
    const root = await renderProbe();

    await act(async () => {
      mockReconnectHandlers.forEach((handler) => handler());
      jest.advanceTimersByTime(200);
    });

    expect(mockGetArchives).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });
});
