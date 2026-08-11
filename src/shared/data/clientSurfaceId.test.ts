import {
	getClientSurfaceId,
	resetClientSurfaceIdForTests,
} from "@/shared/data/clientSurfaceId";

function createStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => [...values.keys()][index] ?? null,
		removeItem: (key) => {
			values.delete(key);
		},
		setItem: (key, value) => {
			values.set(key, value);
		},
	};
}

describe("client surface id", () => {
	const originalWindow = globalThis.window;

	afterEach(() => {
		resetClientSurfaceIdForTests();
		if (originalWindow) {
			(globalThis as Record<string, unknown>).window = originalWindow;
		} else {
			delete (globalThis as Record<string, unknown>).window;
		}
	});

	it("keeps one id for websocket reconnects in the current page lifecycle", () => {
		const sessionStorage = createStorage();
		(globalThis as Record<string, unknown>).window = {
			sessionStorage,
		};

		const first = getClientSurfaceId();
		const second = getClientSurfaceId();

		expect(first).toMatch(/^surface-/);
		expect(second).toBe(first);
		expect(sessionStorage.getItem("agent-webclient.surfaceId.v1")).toBe(first);
	});

	it("reuses the stored id after a page reload", () => {
		const sessionStorage = createStorage();
		sessionStorage.setItem("agent-webclient.surfaceId.v1", "surface-old-page");
		(globalThis as Record<string, unknown>).window = {
			sessionStorage,
			performance: {
				getEntriesByType: () => [{ type: "reload" }],
			},
		};

		const next = getClientSurfaceId();

		expect(next).toBe("surface-old-page");
		expect(sessionStorage.getItem("agent-webclient.surfaceId.v1")).toBe(next);
	});

	it("generates a new id for a copied tab navigation", () => {
		const sessionStorage = createStorage();
		sessionStorage.setItem("agent-webclient.surfaceId.v1", "surface-copied-page");
		(globalThis as Record<string, unknown>).window = {
			sessionStorage,
			performance: {
				getEntriesByType: () => [{ type: "navigate" }],
			},
		};

		const next = getClientSurfaceId();

		expect(next).toMatch(/^surface-/);
		expect(next).not.toBe("surface-copied-page");
	});

	it("uses a different value for another tab", () => {
		const firstStorage = createStorage();
		(globalThis as Record<string, unknown>).window = {
			sessionStorage: firstStorage,
		};
		const first = getClientSurfaceId();

		resetClientSurfaceIdForTests();
		const secondStorage = createStorage();
		(globalThis as Record<string, unknown>).window = {
			sessionStorage: secondStorage,
		};
		const second = getClientSurfaceId();

		expect(second).not.toBe(first);
	});
});
