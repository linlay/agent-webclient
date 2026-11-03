import {
  dataEndpoints,
} from "@/shared/data/api/endpoints";
import {
  NativeURL,
} from "@/shared/data/api/http";
import type {
  ResourceUrlClassificationOptions,
  ResourceUrlClassification,
} from "@/shared/data/api/dto/resources";
import {
	CHAT_FILE_ALIAS,
	WORKSPACE_FILE_ALIAS,
	hasFileAlias,
	parseLocalAbsolutePath,
} from "@/shared/utils/fileAddress";

export function buildResourceUrl(file: string, chatId = ""): string {
	const normalized = String(file || "").trim();
	const search = new URLSearchParams();
	search.set("file", normalized);
	if (chatId) {
		search.set("chatId", chatId);
	}
	return `${dataEndpoints.resource.path}?${search.toString()}`;
}

export function isLegacyResourceUrl(value: string): boolean {
	const normalized = String(value || "").trim();
	if (!normalized) return false;
	try {
		const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
		const parsed = new NativeURL(normalized, origin);
		return parsed.origin === origin
			&& parsed.pathname === dataEndpoints.resource.path;
	} catch {
		return false;
	}
}

/**
 * "@chat/<path>" is literal: tool results and stored urls are never
 * percent-encoded, so nothing is decoded. The transport key encodes each
 * segment once; Platform decodes it once and keeps a literal percent.
 */
function chatAliasToResourceKey(source: string): string | null {
	const relativePath = source.slice(CHAT_FILE_ALIAS.length).replace(/\\/g, "/");
	if (relativePath.length > 2_048) return null;
	const segments = relativePath.split("/");
	const encoded: string[] = [];
	for (const segment of segments) {
		if (!segment || segment === "." || segment === ".." || /[\u0000-\u001f\u007f]/u.test(segment)) {
			return null;
		}
		// Platform rejects a name that decodes to traversal; fail the same way here.
		try {
			const decoded = decodeURIComponent(segment);
			if (decoded === "." || decoded === ".." || /[/\\]/u.test(decoded)) return null;
		} catch {
			// A literal percent sign is an ordinary character.
		}
		encoded.push(encodeURIComponent(segment));
	}
	return encoded.join("/");
}

function invalidResource(
	source: string,
	invalidReason?: ResourceUrlClassification["invalidReason"],
): ResourceUrlClassification {
	return {
		kind: "invalid",
		source,
		fetchUrl: "",
		requiresPlatformAuth: false,
		...(invalidReason ? { invalidReason } : {}),
	};
}

/**
 * Classifies a file or media target. A file is named only by an explicit
 * root: "@chat/" for the current Chat, or "@workspace/" and a host absolute
 * path for the agent Workspace. A Workspace file is read by agent and path,
 * never through the Chat data plane, so a link and an image naming the same
 * path read the same file.
 */
export function classifyResourceUrl(
	value: string,
	chatId = "",
	_options: ResourceUrlClassificationOptions = {},
): ResourceUrlClassification {
	const original = String(value || "").trim();
	// The transport endpoint is never an address, even though it looks absolute.
	if (isLegacyResourceUrl(original)) {
		return invalidResource(original);
	}
	const localPath = parseLocalAbsolutePath(original);
	if (hasFileAlias(original, WORKSPACE_FILE_ALIAS) || localPath?.kind === "local") {
		return {
			kind: "workspace",
			source: original,
			fetchUrl: "",
			requiresPlatformAuth: false,
		};
	}
	if (localPath?.kind === "unsupported") {
		return invalidResource(original, "unsupported_path");
	}
	if (localPath?.kind === "invalid") {
		return invalidResource(original);
	}
	if (hasFileAlias(original, CHAT_FILE_ALIAS)) {
		const resourceKey = chatAliasToResourceKey(original);
		if (resourceKey === null) return invalidResource(original);
		const expectedChatId = String(chatId || "").trim();
		if (!expectedChatId) return invalidResource(original, "chat_context_required");
		return {
			kind: "chat",
			source: original,
			fetchUrl: buildResourceUrl(`${expectedChatId}/${resourceKey}`),
			resourceKey,
			requiresPlatformAuth: true,
		};
	}
	if (/^https?:\/\//i.test(original)) {
		try {
			const parsed = new NativeURL(original);
			if (parsed.protocol === "http:" || parsed.protocol === "https:") {
				return {
					kind: "external",
					source: original,
					fetchUrl: original,
					requiresPlatformAuth: false,
				};
			}
		} catch {
			// Fall through to invalid.
		}
	}
	if (/^(?:data|blob):/i.test(original)) {
		return {
			kind: "inline",
			source: original,
			fetchUrl: original,
			requiresPlatformAuth: false,
		};
	}
	if (original && !/^[a-z][a-z\d+.-]*:/i.test(original) && !original.startsWith("/") && !original.startsWith("#")) {
		return invalidResource(original, "unscoped");
	}
	return invalidResource(original);
}

export function getResourceRequestTarget(
	value: string,
	chatId: string,
	fallbackMessage: string,
	options: ResourceUrlClassificationOptions = {},
): ResourceUrlClassification {
	const classified = classifyResourceUrl(value, chatId, options);
	if (classified.kind === "invalid" || classified.kind === "workspace") {
		throw new Error(fallbackMessage);
	}
	return classified;
}
