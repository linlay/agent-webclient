const AWAITING_SUBMIT_STORAGE_KEY = "agent-webclient.awaitingSubmitIds.v1";
const AWAITING_SUBMIT_TTL_MS = 24 * 60 * 60 * 1000;

interface AwaitingSubmitRecord {
	submitId: string;
	createdAt: number;
}

const memoryRecords = new Map<string, AwaitingSubmitRecord>();

function toText(value: unknown): string {
	return String(value || "").trim();
}

export function buildAwaitingSubmitKey(runId: unknown, awaitingId: unknown): string {
	const normalizedRunId = toText(runId);
	const normalizedAwaitingId = toText(awaitingId);
	return normalizedRunId && normalizedAwaitingId
		? `${normalizedRunId}#${normalizedAwaitingId}`
		: "";
}

function getSessionStorage(): Storage | null {
	try {
		if (typeof window === "undefined" || !window.sessionStorage) {
			return null;
		}
		return window.sessionStorage;
	} catch {
		return null;
	}
}

function normalizeRecord(value: unknown): AwaitingSubmitRecord | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	const record = value as Record<string, unknown>;
	const submitId = toText(record.submitId);
	const createdAt = Number(record.createdAt);
	if (!submitId) {
		return null;
	}
	return {
		submitId,
		createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
	};
}

function readStoredRecords(): Record<string, AwaitingSubmitRecord> {
	const storage = getSessionStorage();
	if (!storage) {
		return {};
	}
	try {
		const raw = storage.getItem(AWAITING_SUBMIT_STORAGE_KEY);
		if (!raw) {
			return {};
		}
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}
		const records: Record<string, AwaitingSubmitRecord> = {};
		for (const [key, value] of Object.entries(parsed)) {
			const record = normalizeRecord(value);
			if (record) {
				records[key] = record;
			}
		}
		return records;
	} catch {
		return {};
	}
}

function writeStoredRecords(records: Record<string, AwaitingSubmitRecord>): void {
	const storage = getSessionStorage();
	if (!storage) {
		return;
	}
	try {
		const keys = Object.keys(records);
		if (keys.length === 0) {
			storage.removeItem(AWAITING_SUBMIT_STORAGE_KEY);
			return;
		}
		storage.setItem(AWAITING_SUBMIT_STORAGE_KEY, JSON.stringify(records));
	} catch {
		// Ignore storage quota and privacy-mode failures; memory still covers live events.
	}
}

function isRecordFresh(record: AwaitingSubmitRecord, now = Date.now()): boolean {
	return now - record.createdAt <= AWAITING_SUBMIT_TTL_MS;
}

function pruneExpiredRecords(now = Date.now()): void {
	let memoryChanged = false;
	for (const [key, record] of memoryRecords.entries()) {
		if (!isRecordFresh(record, now)) {
			memoryRecords.delete(key);
			memoryChanged = true;
		}
	}
	const records = readStoredRecords();
	let storageChanged = memoryChanged;
	for (const [key, record] of Object.entries(records)) {
		if (!isRecordFresh(record, now)) {
			delete records[key];
			storageChanged = true;
		}
	}
	if (storageChanged) {
		writeStoredRecords(records);
	}
}

export function rememberAwaitingSubmitId(
	runId: unknown,
	awaitingId: unknown,
	submitId: unknown,
): string {
	const key = buildAwaitingSubmitKey(runId, awaitingId);
	const normalizedSubmitId = toText(submitId);
	if (!key || !normalizedSubmitId) {
		return "";
	}
	pruneExpiredRecords();
	const record = { submitId: normalizedSubmitId, createdAt: Date.now() };
	memoryRecords.set(key, record);
	const records = readStoredRecords();
	records[key] = record;
	writeStoredRecords(records);
	return key;
}

export function readAwaitingSubmitId(
	runId: unknown,
	awaitingId: unknown,
): string {
	const key = buildAwaitingSubmitKey(runId, awaitingId);
	if (!key) {
		return "";
	}
	pruneExpiredRecords();
	const memoryRecord = memoryRecords.get(key);
	if (memoryRecord && isRecordFresh(memoryRecord)) {
		return memoryRecord.submitId;
	}
	const storedRecord = readStoredRecords()[key];
	if (!storedRecord || !isRecordFresh(storedRecord)) {
		return "";
	}
	memoryRecords.set(key, storedRecord);
	return storedRecord.submitId;
}

export function clearAwaitingSubmitId(runId: unknown, awaitingId: unknown): void {
	const key = buildAwaitingSubmitKey(runId, awaitingId);
	if (!key) {
		return;
	}
	memoryRecords.delete(key);
	const records = readStoredRecords();
	if (records[key]) {
		delete records[key];
		writeStoredRecords(records);
	}
}

export function clearAllAwaitingSubmitIdsForTest(): void {
	memoryRecords.clear();
	writeStoredRecords({});
}
