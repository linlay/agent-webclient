export type TransportMode = "sse" | "ws";

export const TRANSPORT_MODE_STORAGE_KEY = "agent-webclient.transportMode";

export function normalizeTransportMode(value: unknown): TransportMode {
	return value === "ws" ? "ws" : "sse";
}

export function readStoredTransportMode(): TransportMode | null {
	if (typeof localStorage === "undefined") {
		return null;
	}

	try {
		const stored = localStorage.getItem(TRANSPORT_MODE_STORAGE_KEY);
		if (!stored) {
			return null;
		}
		return normalizeTransportMode(stored);
	} catch (_error) {
		return null;
	}
}

export function writeStoredTransportMode(mode: TransportMode): void {
	if (typeof localStorage === "undefined") {
		return;
	}

	try {
		localStorage.setItem(TRANSPORT_MODE_STORAGE_KEY, mode);
	} catch (_error) {
		// Ignore storage write failures and keep the in-memory state.
	}
}
