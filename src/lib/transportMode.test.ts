import {
	normalizeTransportMode,
	readStoredTransportMode,
	TRANSPORT_MODE_STORAGE_KEY,
	writeStoredTransportMode,
} from "./transportMode";

describe("transportMode helpers", () => {
	afterEach(() => {
		delete (globalThis as Record<string, unknown>).localStorage;
	});

	it("defaults unknown values to sse", () => {
		expect(normalizeTransportMode("ws")).toBe("ws");
		expect(normalizeTransportMode("sse")).toBe("sse");
		expect(normalizeTransportMode("grpc")).toBe("sse");
		expect(normalizeTransportMode(undefined)).toBe("sse");
	});

	it("reads and writes the stored transport mode", () => {
		const store = new Map<string, string>();
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) => store.get(key) ?? null,
				setItem: (key: string, value: string) => {
					store.set(key, value);
				},
			},
		});

		writeStoredTransportMode("ws");
		expect(store.get(TRANSPORT_MODE_STORAGE_KEY)).toBe("ws");
		expect(readStoredTransportMode()).toBe("ws");
	});

	it("fails soft when localStorage access throws", () => {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: () => {
					throw new Error("read blocked");
				},
				setItem: () => {
					throw new Error("write blocked");
				},
			},
		});

		expect(readStoredTransportMode()).toBeNull();
		expect(() => writeStoredTransportMode("ws")).not.toThrow();
	});
});
