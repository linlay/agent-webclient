import { t } from "@/shared/i18n";

export interface PlatformError {
	code: string;
	category: string;
	scope: string;
	status: number | null;
	retryable: boolean | null;
	message: string;
	diagnostics: unknown;
	raw: unknown;
	technicalText: string;
}

export interface PlatformErrorDisplay {
	message: string;
	code: string;
	category: string;
	scope: string;
	status: number | null;
	retryable: boolean | null;
	retryHint: string;
	technicalText: string;
	error: PlatformError;
}

const RETRY_TEXT_ZH = String.fromCharCode(0x91cd, 0x8bd5);
const LATER_TEXT_ZH = String.fromCharCode(0x7a0d, 0x540e);
const GENERIC_MESSAGE_ZH = String.fromCharCode(
	0x64cd,
	0x4f5c,
	0x5931,
	0x8d25,
	0xff0c,
	0x8bf7,
	0x7a0d,
	0x540e,
	0x91cd,
	0x8bd5,
);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object";
}

function readRecordPath(
	input: unknown,
	path: string[],
): Record<string, unknown> | null {
	let current: unknown = input;
	for (const key of path) {
		if (!isObjectRecord(current)) {
			return null;
		}
		current = current[key];
	}
	return isObjectRecord(current) ? current : null;
}

function readString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim()) {
		const numberValue = Number(value);
		return Number.isFinite(numberValue) ? numberValue : null;
	}
	return null;
}

function readBoolean(value: unknown): boolean | null {
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return null;
}

function isStructuredErrorRecord(value: unknown): value is Record<string, unknown> {
	if (!isObjectRecord(value)) {
		return false;
	}
	return [
		"category",
		"code",
		"scope",
		"status",
		"retryable",
		"message",
		"diagnostics",
		"userSafeMessageKey",
	].some((key) => key in value);
}

function pickStructuredError(input: unknown): Record<string, unknown> | null {
	const platformError = readRecordPath(input, ["platformError"]);
	if (platformError) {
		return platformError;
	}

	const candidates: unknown[] = [
		readRecordPath(input, ["data", "error"]),
		readRecordPath(input, ["payload", "error"]),
		isObjectRecord(input) ? input.error : null,
		input,
	];

	for (const candidate of candidates) {
		if (isStructuredErrorRecord(candidate)) {
			return candidate;
		}
	}

	return null;
}

function readFallbackMessage(input: unknown, structured: unknown): string {
	if (isObjectRecord(structured)) {
		const message = readString(structured.message);
		if (message) return message;
	}
	if (typeof structured === "string") {
		const message = structured.trim();
		if (message) return message;
	}
	if (isObjectRecord(input)) {
		const message =
			readString(input.msg) ||
			readString(input.message) ||
			(typeof input.error === "string" ? input.error.trim() : "");
		if (message) return message;
	}
	if (input instanceof Error) {
		return readString(input.message);
	}
	return "";
}

function readFallbackCode(
	input: unknown,
	structured: Record<string, unknown> | null,
): string {
	const structuredCode = readString(structured?.code);
	if (structuredCode) {
		return structuredCode;
	}
	const userSafeMessageKey = readString(structured?.userSafeMessageKey);
	if (userSafeMessageKey) {
		return userSafeMessageKey;
	}
	if (!isObjectRecord(input)) {
		return "";
	}
	const type = readString(input.type);
	if (type) {
		return type;
	}
	return readString(input.code);
}

function buildTechnicalText(error: Omit<PlatformError, "technicalText">): string {
	const payload: Record<string, unknown> = {};
	if (error.code) payload.code = error.code;
	if (error.category) payload.category = error.category;
	if (error.scope) payload.scope = error.scope;
	if (error.status != null) payload.status = error.status;
	if (error.retryable != null) payload.retryable = error.retryable;
	if (error.message) payload.message = error.message;
	if (error.diagnostics != null) payload.diagnostics = error.diagnostics;
	if (error.raw != null) payload.raw = error.raw;
	try {
		return JSON.stringify(payload, null, 2);
	} catch {
		return String(error.message || error.code || "");
	}
}

export function normalizePlatformError(input: unknown): PlatformError {
	const structured = pickStructuredError(input);
	const record = isObjectRecord(input) ? input : null;
	const code = readFallbackCode(input, structured);
	const status =
		readNumber(structured?.status) ??
		readNumber(record?.status) ??
		readNumber(record?.code);
	const errorWithoutTechnicalText = {
		code,
		category: readString(structured?.category),
		scope: readString(structured?.scope),
		status,
		retryable: readBoolean(structured?.retryable),
		message: readFallbackMessage(input, structured),
		diagnostics: structured?.diagnostics,
		raw: structured ?? input,
	};

	return {
		...errorWithoutTechnicalText,
		technicalText: buildTechnicalText(errorWithoutTechnicalText),
	};
}

function translateIfAvailable(key: string): string {
	if (!key) {
		return "";
	}
	const translated = t(key);
	return translated && translated !== key ? translated : "";
}

function includesRetryIntent(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes(RETRY_TEXT_ZH) ||
		normalized.includes(LATER_TEXT_ZH) ||
		normalized.includes("retry") ||
		normalized.includes("try again")
	);
}

export function formatPlatformErrorForDisplay(
	input: unknown,
): PlatformErrorDisplay {
	const error = normalizePlatformError(input);
	const codeMessage = translateIfAvailable(
		error.code ? `platformError.code.${error.code}` : "",
	);
	const categoryMessage = translateIfAvailable(
		error.category ? `platformError.category.${error.category}` : "",
	);
	const genericMessage =
		translateIfAvailable("platformError.generic") ||
		GENERIC_MESSAGE_ZH;
	const retryHint =
		error.retryable === true
			? translateIfAvailable("platformError.retryableHint")
			: "";
	const baseMessage = codeMessage || categoryMessage || genericMessage;
	const message =
		retryHint && !includesRetryIntent(baseMessage)
			? `${baseMessage} ${retryHint}`
			: baseMessage;

	return {
		message,
		code: error.code,
		category: error.category,
		scope: error.scope,
		status: error.status,
		retryable: error.retryable,
		retryHint,
		technicalText: error.technicalText,
		error,
	};
}
