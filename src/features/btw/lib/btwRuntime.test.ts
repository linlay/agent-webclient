import { createInitialState } from "@/app/state/state";
import {
  claimRestoredBTWRun,
  discardBTWSessionRegistry,
  isAcceptedBTWInterrupt,
  isCurrentBTWRuntime,
  settleBTWInterrupt,
  type BTWRuntimeIdentity,
} from "@/features/btw/lib/btwRuntime";
import type { BTWSessionState } from "@/features/btw/lib/btwTypes";

const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

beforeAll(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
});

afterAll(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

function createSession(
  parentChatId: string,
  runId: string,
  status: BTWSessionState["status"] = "running",
): BTWSessionState {
  return {
    parentChatId,
    btwId: `btw_${parentChatId}`,
    runId,
    requestId: `req_${runId}`,
    agentKey: "agent_1",
    status,
    interruptReady: status === "running",
    interruptPending: false,
    draft: "",
    error: "",
    focusToken: 0,
    lastSeq: 0,
    updatedAt: 1,
    usage: null,
    config: {},
    projection: createInitialState(),
  };
}

function createRuntime(session: BTWSessionState): BTWRuntimeIdentity {
  return { session, generation: 0 };
}

describe("btwRuntime", () => {
  it("accepts only an acknowledged interrupt for the requested run", () => {
    const response = {
      status: 200,
      code: 0,
      msg: "ok",
      data: {
        accepted: true,
        status: "accepted",
        runId: "run_1",
        detail: "Interrupt accepted",
      },
    };

    expect(isAcceptedBTWInterrupt(response, "run_1")).toBe(true);
    expect(isAcceptedBTWInterrupt(response, "run_2")).toBe(false);
    expect(
      isAcceptedBTWInterrupt(
        { ...response, data: { ...response.data, runId: "" } },
        "run_1",
      ),
    ).toBe(false);
    expect(
      isAcceptedBTWInterrupt(
        {
          ...response,
          data: { ...response.data, accepted: false, status: "unmatched" },
        },
        "run_1",
      ),
    ).toBe(false);
  });

  it("claims only runs restored at provider startup and only once", () => {
    const restoredRunIds = new Set(["run_restored"]);
    const restored = createSession("chat_restored", "run_restored");
    const live = createSession("chat_live", "run_live");

    expect(claimRestoredBTWRun(restoredRunIds, live)).toBe(false);
    expect(claimRestoredBTWRun(restoredRunIds, restored)).toBe(true);
    expect(claimRestoredBTWRun(restoredRunIds, restored)).toBe(false);
  });

  it("stops only an accepted current run and keeps rejected runs retryable", () => {
    const acceptedRuntime = createRuntime(createSession("chat_1", "run_1"));
    const acceptedController = new AbortController();
    acceptedRuntime.session.interruptPending = true;
    acceptedRuntime.session.projection.abortController = acceptedController;
    const acceptedRuntimes = new Map([["chat_1", acceptedRuntime]]);

    expect(
      settleBTWInterrupt({
        runtimes: acceptedRuntimes,
        runtime: acceptedRuntime,
        generation: 0,
        runId: "run_1",
        accepted: true,
      }),
    ).toBe("accepted");
    expect(acceptedController.signal.aborted).toBe(true);
    expect(acceptedRuntime.session.status).toBe("idle");
    expect(acceptedRuntime.session.interruptPending).toBe(false);

    const rejectedRuntime = createRuntime(createSession("chat_2", "run_2"));
    const rejectedController = new AbortController();
    rejectedRuntime.session.interruptPending = true;
    rejectedRuntime.session.projection.abortController = rejectedController;
    expect(
      settleBTWInterrupt({
        runtimes: new Map([["chat_2", rejectedRuntime]]),
        runtime: rejectedRuntime,
        generation: 0,
        runId: "run_2",
        accepted: false,
      }),
    ).toBe("rejected");
    expect(rejectedController.signal.aborted).toBe(false);
    expect(rejectedRuntime.session.status).toBe("running");
    expect(rejectedRuntime.session.interruptPending).toBe(false);
    expect(rejectedRuntime.session.interruptReady).toBe(true);
  });

  it("ignores a delayed interrupt response after the branch was replaced", () => {
    const oldRuntime = createRuntime(createSession("chat_1", "run_old"));
    oldRuntime.session.interruptPending = true;
    const oldController = new AbortController();
    oldRuntime.session.projection.abortController = oldController;
    const currentRuntime = createRuntime(createSession("chat_1", "run_new"));

    expect(
      settleBTWInterrupt({
        runtimes: new Map([["chat_1", currentRuntime]]),
        runtime: oldRuntime,
        generation: 0,
        runId: "run_old",
        accepted: true,
      }),
    ).toBe("stale");
    expect(oldController.signal.aborted).toBe(false);
    expect(currentRuntime.session.status).toBe("running");
  });

  it("discards a running branch without aborting it and invalidates late publishers", () => {
    const session = createSession("chat_1", "run_old");
    const runtime = createRuntime(session);
    const sessions = new Map([[session.parentChatId, session]]);
    const runtimes = new Map([[session.parentChatId, runtime]]);
    const restoredRunIds = new Set([session.runId]);
    const abortController = new AbortController();
    session.projection.abortController = abortController;

    const result = discardBTWSessionRegistry({
      parentChatId: session.parentChatId,
      sessions,
      runtimes,
      restoredRunIds,
    });

    expect(result.removed).toBe(true);
    expect(result.nextSessions.has(session.parentChatId)).toBe(false);
    expect(runtimes.has(session.parentChatId)).toBe(false);
    expect(restoredRunIds.has(session.runId)).toBe(false);
    expect(abortController.signal.aborted).toBe(false);
    expect(isCurrentBTWRuntime(runtimes, runtime, 0)).toBe(false);
  });

  it("keeps an old runtime stale after a new branch opens for the same chat", () => {
    const oldRuntime = createRuntime(createSession("chat_1", "run_old"));
    const runtimes = new Map([["chat_1", oldRuntime]]);
    const discarded = discardBTWSessionRegistry({
      parentChatId: "chat_1",
      sessions: new Map([["chat_1", oldRuntime.session]]),
      runtimes,
      restoredRunIds: new Set(),
    });
    expect(discarded.removed).toBe(true);

    const newRuntime = createRuntime(createSession("chat_1", "run_new"));
    newRuntime.session.btwId = "";
    runtimes.set("chat_1", newRuntime);

    expect(isCurrentBTWRuntime(runtimes, oldRuntime)).toBe(false);
    expect(isCurrentBTWRuntime(runtimes, newRuntime, 0)).toBe(true);
    expect(newRuntime.session.btwId).toBe("");
  });

  it("removes only the requested chat", () => {
    const first = createSession("chat_1", "run_1", "idle");
    const second = createSession("chat_2", "run_2", "idle");
    const result = discardBTWSessionRegistry({
      parentChatId: "chat_1",
      sessions: new Map([
        [first.parentChatId, first],
        [second.parentChatId, second],
      ]),
      runtimes: new Map(),
      restoredRunIds: new Set(),
    });

    expect(result.nextSessions.has("chat_1")).toBe(false);
    expect(result.nextSessions.get("chat_2")).toBe(second);
  });
});
