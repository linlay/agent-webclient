import type { AttachmentLike } from "./attachmentUtils";
import {
	getAttachmentDownloadUrl,
	getAttachmentExtension,
	getAttachmentKind,
	getAttachmentUrl,
} from "./attachmentUtils";

export type AttachmentPreviewKind =
	| "image"
	| "pdf"
	| "text"
	| "audio"
	| "video"
	| "unsupported";

export interface AttachmentPreviewState {
	name: string;
	url: string;
	downloadUrl: string;
	size?: number;
	type?: string;
	mimeType?: string;
	kind: Exclude<AttachmentPreviewKind, "unsupported">;
}

const audioExtensions = new Set([
	"aac",
	"flac",
	"m4a",
	"mp3",
	"oga",
	"ogg",
	"opus",
	"wav",
	"weba",
]);

const textExtensions = new Set([
	"c",
	"cpp",
	"css",
	"csv",
	"go",
	"html",
	"java",
	"js",
	"json",
	"log",
	"md",
	"mjs",
	"py",
	"rb",
	"rs",
	"sh",
	"sql",
	"svg",
	"ts",
	"tsx",
	"txt",
	"xml",
	"yaml",
	"yml",
]);

const videoExtensions = new Set([
	"m4v",
	"mov",
	"mp4",
	"mpeg",
	"mpg",
	"ogv",
	"webm",
]);

function normalizeText(value: unknown): string {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getAttachmentPreviewKind(
	attachment: AttachmentLike,
): AttachmentPreviewKind {
	if (getAttachmentKind(attachment) === "image") {
		return "image";
	}

	const mimeType = normalizeText(attachment.mimeType);
	const extension = getAttachmentExtension(attachment.name);

	if (mimeType === "application/pdf" || extension === "pdf") {
		return "pdf";
	}

	if (mimeType.startsWith("audio/") || audioExtensions.has(extension)) {
		return "audio";
	}

	if (mimeType.startsWith("video/") || videoExtensions.has(extension)) {
		return "video";
	}

	if (
		mimeType.startsWith("text/") ||
		mimeType.includes("json") ||
		mimeType.includes("xml") ||
		mimeType.includes("javascript") ||
		mimeType.includes("ecmascript") ||
		mimeType.includes("yaml") ||
		textExtensions.has(extension)
	) {
		return "text";
	}

	return "unsupported";
}

export function canPreviewAttachment(attachment: AttachmentLike): boolean {
	return getAttachmentPreviewKind(attachment) !== "unsupported";
}

export function buildAttachmentPreviewState(
	attachment: AttachmentLike,
): AttachmentPreviewState | null {
	const url = getAttachmentUrl(attachment);
	if (!url) {
		return null;
	}

	const kind = getAttachmentPreviewKind(attachment);
	if (kind === "unsupported") {
		return null;
	}

	return {
		name: String(attachment.name || "").trim() || "未命名资源",
		url,
		downloadUrl: getAttachmentDownloadUrl(attachment),
		size: attachment.size,
		type: attachment.type,
		mimeType: attachment.mimeType,
		kind,
	};
}
