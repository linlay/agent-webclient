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
const mockRestoreArchives = jest.fn();
const mockDeleteArchive = jest.fn();
const mockModalConfirm = jest.fn();

jest.mock("@/shared/data", () => ({
  getArchives: (...args: unknown[]) => mockGetArchives(...args),
  getAgents: (...args: unknown[]) => mockGetAgents(...args),
  searchArchives: jest.fn(),
  getArchive: jest.fn(),
  archiveChats: jest.fn(),
  restoreArchives: (...args: unknown[]) => mockRestoreArchives(...args),
  deleteArchive: (...args: unknown[]) => mockDeleteArchive(...args),
}));

jest.mock("antd", () => ({
  Modal: { confirm: (...args: unknown[]) => mockModalConfirm(...args) },
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

type ArchiveRuntime = ReturnType<typeof useArchiveRuntime>;

function Probe({ onReady }: { onReady?: (runtime: ArchiveRuntime) => void }) {
  const runtime = useArchiveRuntime({ active: true, showAgentFilter: true });
  onReady?.(runtime);
  return null;
}

async function renderProbe(onReady?: (runtime: ArchiveRuntime) => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Probe onReady={onReady} />);
  });
  // The initial list load is debounced by 180ms.
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
  return root;
}

function archiveRow(chatId: string, agentKey?: string) {
  return {
    chatId,
    chatName: chatId,
    agentKey,
    createdAt: 0,
    updatedAt: 0,
    lastRunAt: 0,
    archivedAt: 0,
  };
}

async function confirmLastDialog() {
  const options = mockModalConfirm.mock.calls.at(-1)?.[0] as {
    onOk: () => Promise<void>;
  };
  await act(async () => {
    await options.onOk();
  });
}

beforeEach(() => {
  mockPushHandlers.clear();
  mockReconnectHandlers.clear();
  mockGetArchives.mockReset();
  mockGetArchives.mockResolvedValue({ data: { items: [], total: 0 } });
  mockGetAgents.mockClear();
  mockRestoreArchives.mockReset();
  mockDeleteArchive.mockReset();
  mockModalConfirm.mockReset();
  mockDispatch.mockClear();
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

describe("useArchiveRuntime group operations", () => {
  it("restores every archived chat in an agent group", async () => {
    mockGetArchives.mockResolvedValueOnce({
      data: {
        items: [
          archiveRow("a1", "agent_a"),
          archiveRow("a2", "agent_a"),
          archiveRow("b1", "agent_b"),
        ],
        total: 3,
      },
    });
    mockRestoreArchives.mockResolvedValueOnce({
      data: {
        results: [
          {
            chatId: "a1",
            success: true,
            summary: { chatId: "a1", chatName: "a1", agentKey: "agent_a" },
          },
          {
            chatId: "a2",
            success: true,
            summary: { chatId: "a2", chatName: "a2", agentKey: "agent_a" },
          },
        ],
      },
    });

    let runtime: ArchiveRuntime | undefined;
    const root = await renderProbe((next) => {
      runtime = next;
    });
    expect(runtime?.items).toHaveLength(3);

    runtime?.restoreGroup("agent_a");
    expect(mockModalConfirm).toHaveBeenCalledTimes(1);
    await confirmLastDialog();

    expect(mockRestoreArchives).toHaveBeenCalledWith({
      chatIds: ["a1", "a2"],
    });
    expect(runtime?.items.map((item) => item.chatId)).toEqual(["b1"]);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPSERT_CHAT" }),
    );
    expect(runtime?.resultText).toBe("archive.group.restoreResult");

    await act(async () => root.unmount());
  });

  it("deletes every archived chat in an agent group and keeps failed rows", async () => {
    mockGetArchives.mockResolvedValueOnce({
      data: {
        items: [
          archiveRow("a1", "agent_a"),
          archiveRow("a2", "agent_a"),
          archiveRow("b1", "agent_b"),
        ],
        total: 3,
      },
    });
    mockDeleteArchive.mockImplementation(
      async ({ chatId }: { chatId: string }) => {
        if (chatId === "a2") throw new Error("still busy");
        return { data: { chatId, deleted: true } };
      },
    );

    let runtime: ArchiveRuntime | undefined;
    const root = await renderProbe((next) => {
      runtime = next;
    });

    runtime?.deleteGroup("agent_a");
    await confirmLastDialog();

    expect(
      mockDeleteArchive.mock.calls.map(
        (call) => (call[0] as { chatId: string }).chatId,
      ),
    ).toEqual(["a1", "a2"]);
    expect(runtime?.items.map((item) => item.chatId)).toEqual(["a2", "b1"]);
    expect(runtime?.resultText).toBe("archive.group.deleteResultWithFailures");

    await act(async () => root.unmount());
  });

  it("leaves the group untouched when the restore request fails", async () => {
    mockGetArchives.mockResolvedValueOnce({
      data: { items: [archiveRow("a1", "agent_a")], total: 1 },
    });

    let runtime: ArchiveRuntime | undefined;
    const root = await renderProbe((next) => {
      runtime = next;
    });

    runtime?.restoreGroup("agent_a");
    const options = mockModalConfirm.mock.calls.at(-1)?.[0] as {
      onOk: () => Promise<void>;
    };
    mockRestoreArchives.mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      await expect(options.onOk()).rejects.toThrow("network");
    });

    expect(runtime?.items.map((item) => item.chatId)).toEqual(["a1"]);

    await act(async () => root.unmount());
  });
});
