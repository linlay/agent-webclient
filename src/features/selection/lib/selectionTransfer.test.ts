import {
  cancelSelectedTextTransfer,
  DESKTOP_SELECTION_BTW_TARGET,
  parseTransferredSelectedTextFragment,
  receiveSelectedTextTransfers,
  stageSelectedTextTransfer,
} from "@/features/selection/lib/selectionTransfer";
import { createSelectedTextFragment } from "@/features/selection/lib/selectedTextReference";

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();

  private readonly listeners = new Set<(event: MessageEvent) => void>();

  constructor(private readonly name: string) {
    const channels = FakeBroadcastChannel.channels.get(name) || new Set();
    channels.add(this);
    FakeBroadcastChannel.channels.set(name, channels);
  }

  addEventListener(_type: "message", listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }

  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.channels.get(this.name) || []) {
      if (channel === this) continue;
      queueMicrotask(() => {
        for (const listener of channel.listeners) {
          listener({ data } as MessageEvent);
        }
      });
    }
  }

  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
    this.listeners.clear();
  }

  static reset() {
    FakeBroadcastChannel.channels.clear();
  }
}

describe("selected text cross-surface transfer", () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;

  beforeEach(() => {
    FakeBroadcastChannel.reset();
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: FakeBroadcastChannel,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: originalBroadcastChannel,
    });
  });

  it("delivers one in-memory fragment only to the matching chat and transfer id", async () => {
    const fragment = createSelectedTextFragment({
      text: "selected text",
      targetId: "message-1",
      sourceKind: "message",
    });
    expect(fragment).not.toBeNull();
    const staged = stageSelectedTextTransfer({
      targetId: DESKTOP_SELECTION_BTW_TARGET,
      chatId: "chat-1",
      fragment: fragment!,
    });
    expect(staged).not.toBeNull();
    const received: unknown[] = [];
    const stop = receiveSelectedTextTransfers({
      targetId: DESKTOP_SELECTION_BTW_TARGET,
      chatId: "chat-1",
      onFragment: (value) => {
        received.push(value);
        return true;
      },
    });

    await expect(staged!.delivered).resolves.toBe(true);
    expect(received).toEqual([fragment]);
    stop();
  });

  it("rejects malformed fragments and supports explicit cancellation", async () => {
    expect(parseTransferredSelectedTextFragment({
      targetId: "message-1",
      reference: {
        id: "selection-1",
        type: "selection",
        name: "Selected text",
        mimeType: "text/plain",
        sizeBytes: 1,
        meta: { text: "selected text", sourceKind: "message" },
      },
    })).toBeNull();

    const fragment = createSelectedTextFragment({
      text: "selected text",
      targetId: "message-1",
      sourceKind: "message",
    });
    const staged = stageSelectedTextTransfer({
      targetId: DESKTOP_SELECTION_BTW_TARGET,
      chatId: "chat-1",
      fragment: fragment!,
    });
    cancelSelectedTextTransfer(staged!.transferId);
    await expect(staged!.delivered).resolves.toBe(false);
  });
});
