import { createInitialState } from "@/app/state/state";
import type { BTWSessionState } from "@/features/btw/lib/btwTypes";
import {
  BTW_MAX_STORED_CHATS,
  BTW_MAX_TRANSCRIPT_ITEMS,
  BTW_SESSION_STORAGE_KEY,
  buildBTWTranscript,
  persistBTWSessions,
  readPersistedBTWSessions,
  removePersistedBTWSessions,
} from "@/features/btw/lib/btwPersistence";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => values.set(key, value)),
    removeItem: jest.fn((key: string) => values.delete(key)),
    clear: jest.fn(() => values.clear()),
    key: jest.fn((index: number) => Array.from(values.keys())[index] ?? null),
    get length() {
      return values.size;
    },
  } as Storage;
}

function createSession(parentChatId: string, itemCount = 2): BTWSessionState {
  const projection = createInitialState();
  const timestampBase = 1_700_000_000_000;
  projection.chatId = parentChatId;
  for (let index = 0; index < itemCount; index += 1) {
    const userId = `user_${index}`;
    const contentId = `content_${index}`;
    projection.timelineNodes.set(userId, {
      id: userId,
      kind: "message",
      role: "user",
      text: `question ${index}`,
      ts: timestampBase + index * 2 + 1,
    });
    projection.timelineNodes.set(contentId, {
      id: contentId,
      kind: "content",
      contentId,
      text: `answer ${index}`,
      status: "completed",
      ts: timestampBase + index * 2 + 2,
    });
    projection.timelineOrder.push(userId, contentId);
  }
  return {
    parentChatId,
    btwId: `btw_${parentChatId}`,
    runId: "run_1",
    requestId: "req_1",
    agentKey: "agent_1",
    status: "idle",
    interruptReady: false,
    interruptPending: false,
    draft: "",
    error: "",
    focusToken: 0,
    lastSeq: 4,
    updatedAt: Date.now(),
    usage: null,
    config: {},
    projection,
  };
}

describe("btwPersistence", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { pathname: "/", search: "" },
        localStorage: createStorage(),
        sessionStorage: createStorage(),
      },
    });
  });

  afterAll(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("round-trips branch identity and a compact transcript", () => {
    persistBTWSessions([createSession("chat_1")]);

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      BTW_SESSION_STORAGE_KEY,
      expect.any(String),
    );
    expect(readPersistedBTWSessions()).toMatchObject([
      {
        parentChatId: "chat_1",
        btwId: "btw_chat_1",
        runId: "run_1",
        transcript: [
          { role: "user", text: "question 0" },
          { role: "assistant", text: "answer 0" },
          { role: "user", text: "question 1" },
          { role: "assistant", text: "answer 1" },
        ],
      },
    ]);
  });

  it("keeps only the pending user turn while a run is active", () => {
    const session = createSession("chat_running");
    session.status = "running";

    expect(buildBTWTranscript(session).at(-1)).toMatchObject({
      role: "user",
      text: "question 1",
    });
  });

  it("keeps multiple stable BTW branches for the same agent and chat", () => {
    const first = createSession("chat_shared");
    first.btwId = "btw_first";
    first.updatedAt = 1_786_890_000_001;
    persistBTWSessions([first]);

    const second = createSession("chat_shared");
    second.btwId = "btw_second";
    second.updatedAt = 1_786_890_000_002;
    persistBTWSessions([second]);

    expect(readPersistedBTWSessions().map((item) => item.btwId)).toEqual([
      "btw_second",
      "btw_first",
    ]);
  });

  it("caps stored chats and transcript entries", () => {
    const sessions = Array.from(
      { length: BTW_MAX_STORED_CHATS + 5 },
      (_, index) => createSession(`chat_${index}`, BTW_MAX_TRANSCRIPT_ITEMS),
    );

    persistBTWSessions(sessions);
    const restored = readPersistedBTWSessions();

    expect(restored).toHaveLength(BTW_MAX_STORED_CHATS);
    expect(restored[0].transcript.length).toBeLessThanOrEqual(
      BTW_MAX_TRANSCRIPT_ITEMS,
    );
  });

  it("preserves distinct branch identities and removes discarded chats explicitly", () => {
    const first = createSession("chat_1");
    const second = createSession("chat_2");
    persistBTWSessions([first, second]);

    persistBTWSessions([second]);
    expect(readPersistedBTWSessions().map((item) => item.parentChatId)).toEqual([
      "chat_2",
      "chat_1",
    ]);

    removePersistedBTWSessions("chat_1");
    removePersistedBTWSessions("chat_2");
    expect(readPersistedBTWSessions()).toEqual([]);
  });

  it("fails soft on corrupt storage", () => {
    window.localStorage.setItem(BTW_SESSION_STORAGE_KEY, "{");
    expect(readPersistedBTWSessions()).toEqual([]);
  });
});
