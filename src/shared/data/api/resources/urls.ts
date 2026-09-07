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

function decodeSafeResourceSegment(segment: string): string | null {
	if (!segment) return null;
	try {
		const decoded = decodeURIComponent(segment);
		if (!decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
			return null;
		}
		return decoded;
	} catch {
		return null;
	}
}

export function isChatScopeResourceRef(value: string, chatId: string): boolean {
	const normalized = String(value || "").trim();
	const expectedChatId = String(chatId || "").trim();
	if (!normalized || !expectedChatId || normalized.startsWith("/") || normalized.includes("\\")) {
		return false;
	}
	if (/^[a-z][a-z\d+.-]*:/i.test(normalized) || normalized.startsWith("//") || normalized.includes("?") || normalized.includes("#")) {
		return false;
	}
	const segments = normalized.split("/");
	const decodedSegments = segments.map(decodeSafeResourceSegment);
	if (decodedSegments.some((segment) => segment === null)) {
		return false;
	}
	return decodedSegments[0] !== expectedChatId;
}

function decodedAbsoluteResourcePath(source: string): string | null {
	try {
		const decoded = decodeURIComponent(source);
		if (
			!decoded.startsWith("/")
			|| decoded.startsWith("//")
			|| decoded.includes("\\")
			|| decoded.includes("\u0000")
			|| source.includes("?")
			|| source.includes("#")
		) {
			return null;
		}
		const segments = decoded.slice(1).split("/");
		if (
			segments.length === 0
			|| segments.some((segment) => !segment || segment === "." || segment === "..")
		) {
			return null;
		}
		return decoded;
	} catch {
		return null;
	}
}

export function classifyResourceUrl(
	value: string,
	chatId = "",
	_options: ResourceUrlClassificationOptions = {},
): ResourceUrlClassification {
	const source = String(value || "").trim();
	if (isLegacyResourceUrl(source)) {
		return {
			kind: "invalid",
			source,
			fetchUrl: "",
			requiresPlatformAuth: false,
		};
	}
	if (/^https?:\/\//i.test(source)) {
		try {
			const parsed = new NativeURL(source);
			if (parsed.protocol === "http:" || parsed.protocol === "https:") {
				return {
					kind: "external",
					source,
					fetchUrl: source,
					requiresPlatformAuth: false,
				};
			}
		} catch {
			// Fall through to invalid.
		}
	}
	if (/^(?:data|blob):/i.test(source)) {
		return {
			kind: "inline",
			source,
			fetchUrl: source,
			requiresPlatformAuth: false,
		};
	}
	if (source.startsWith("/")) {
		const resourcePath = decodedAbsoluteResourcePath(source);
		if (resourcePath && chatId) {
			return {
				kind: "absolute",
				source,
				fetchUrl: buildResourceUrl(resourcePath, chatId),
				resourceKey: resourcePath,
				requiresPlatformAuth: true,
			};
		}
		return {
			kind: "invalid",
			source,
			fetchUrl: "",
			requiresPlatformAuth: false,
		};
	}
	if (isChatScopeResourceRef(source, chatId)) {
		return {
			kind: "chat",
			source,
			fetchUrl: buildResourceUrl(`${chatId}/${source}`),
			resourceKey: source,
			requiresPlatformAuth: true,
		};
	}
	return {
		kind: "invalid",
		source,
		fetchUrl: "",
		requiresPlatformAuth: false,
	};
}

export function getResourceRequestTarget(
	value: string,
	chatId: string,
	fallbackMessage: string,
	options: ResourceUrlClassificationOptions = {},
): ResourceUrlClassification {
	const classified = classifyResourceUrl(value, chatId, options);
	if (classified.kind === "invalid") {
		throw new Error(fallbackMessage);
	}
	return classified;
}
