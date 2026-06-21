import {
	buildAwaitingSubmitKey,
	clearAllAwaitingSubmitIdsForTest,
	clearAwaitingSubmitId,
	readAwaitingSubmitId,
	rememberAwaitingSubmitId,
} from "@/features/tools/lib/awaitingSubmitTracker";

const STORAGE_KEY = "agent-webclient.awaitingSubmitIds.v1";

function createMockStorage(): Storage & { dump: () => Record<string, string> } {
	const store: Record<string, string> = {};
	return {
		get length() {
			return Object.keys(store).length;
		},
		clear: () => {
			for (const key of Object.keys(store)) {
				delete store[key];
			}
		},
		getItem: (key: string) =>
			Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
		key: (index: number) => Object.keys(store)[index] ?? null,
		removeItem: (key: string) => {
			delete store[key];
		},
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		dump: () => ({ ...store }),
	};
}

describe("awaiting submit tracker", () => {
	let originalWindow: unknown;
	let storage: ReturnType<typeof createMockStorage>;

	beforeEach(() => {
		originalWindow = (globalThis as { window?: unknown }).window;
		storage = createMockStorage();
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				sessionStorage: storage,
			},
		});
		clearAllAwaitingSubmitIdsForTest();
	});

	afterEach(() => {
		clearAllAwaitingSubmitIdsForTest();
		if (originalWindow === undefined) {
			delete (globalThis as { window?: unknown }).window;
		} else {
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: originalWindow,
			});
		}
	});

	it("stores submitId by runId and awaitingId", () => {
		expect(buildAwaitingSubmitKey("run_1", "await_1")).toBe("run_1#await_1");

		expect(
			rememberAwaitingSubmitId("run_1", "await_1", "submit_1"),
		).toBe("run_1#await_1");

		expect(readAwaitingSubmitId("run_1", "await_1")).toBe("submit_1");
		expect(storage.dump()[STORAGE_KEY]).toContain("submit_1");
	});

	it("keeps separate submitIds for multiple awaitings in the same run", () => {
		rememberAwaitingSubmitId("run_1", "await_1", "submit_1");
		rememberAwaitingSubmitId("run_1", "await_2", "submit_2");

		expect(readAwaitingSubmitId("run_1", "await_1")).toBe("submit_1");
		expect(readAwaitingSubmitId("run_1", "await_2")).toBe("submit_2");
	});

	it("clears a stored submitId by awaiting key", () => {
		rememberAwaitingSubmitId("run_1", "await_1", "submit_1");

		clearAwaitingSubmitId("run_1", "await_1");

		expect(readAwaitingSubmitId("run_1", "await_1")).toBe("");
		expect(storage.dump()[STORAGE_KEY]).toBeUndefined();
	});
});
