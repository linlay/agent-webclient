const COMPACT_ID_MAX_PER_SECOND = 1000;
const COMPACT_ID_MULTIPLIER = 1000;

let compactIdSecond = -1;
let compactIdCounter = 0;

export interface CreateCompactIdOptions {
	nowMs?: number;
	overflowMessage?: string;
}

function normalizeCompactIdPrefix(prefix: string): string {
	const normalized = String(prefix || "")
		.trim()
		.replace(/_+$/g, "");
	return normalized || "id";
}

export function createCompactId(
	prefix: string,
	options: CreateCompactIdOptions = {},
): string {
	const nowMs = options.nowMs ?? Date.now();
	const second = Math.floor(nowMs / 1000);
	if (second !== compactIdSecond) {
		compactIdSecond = second;
		compactIdCounter = 0;
	}

	if (compactIdCounter >= COMPACT_ID_MAX_PER_SECOND) {
		throw new Error(
			options.overflowMessage || "Request id overflow in the same second",
		);
	}

	const combined = second * COMPACT_ID_MULTIPLIER + compactIdCounter;
	compactIdCounter += 1;
	return `${normalizeCompactIdPrefix(prefix)}_${combined.toString(36)}`;
}

export function resetCompactIdStateForTests(): void {
	compactIdSecond = -1;
	compactIdCounter = 0;
}
