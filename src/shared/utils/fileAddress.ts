/**
 * File addresses shared by Markdown, viewers and the Desktop WorkPanel.
 *
 * "@chat/<path>" names a file in the current Chat and "@workspace/<path>" a
 * file in the bound project; a Workspace location may end with ":<line>". The
 * path is literal: nothing in it is URL syntax, so it is never percent-decoded.
 * A relative path without one of these roots names no file.
 */
export const CHAT_FILE_ALIAS = "@chat/";
export const WORKSPACE_FILE_ALIAS = "@workspace/";

const MAX_FILE_PATH_LENGTH = 2_048;

export function hasFileAlias(value: string, alias: string): boolean {
	return value.slice(0, alias.length).toLowerCase() === alias;
}

export type LocalAbsolutePath =
	| { kind: "local"; path: string }
	| { kind: "unsupported" }
	| { kind: "invalid" };

function localAbsolutePath(path: string): LocalAbsolutePath {
	if (!path || path.length > MAX_FILE_PATH_LENGTH || /[\u0000-\u001f\u007f]/u.test(path)) {
		return { kind: "invalid" };
	}
	// Only the root may be empty; "." and ".." are rejected even when encoded,
	// matching how Platform rejects traversal in file names.
	const segments = path.split(/[\\/]/u);
	const invalid = segments.some((segment, index) => {
		if (!segment) return index > 0;
		let decoded = segment;
		try {
			decoded = decodeURIComponent(segment);
		} catch {
			// A literal percent sign is an ordinary character.
		}
		return decoded === "." || decoded === "..";
	});
	return invalid ? { kind: "invalid" } : { kind: "local", path };
}

/**
 * Recognizes a host absolute path or file URL. Recognition is not permission:
 * the Platform host resolves the path by its own platform rules and accepts it
 * only inside the agent Workspace. UNC and other network paths are not
 * supported yet and are reported instead of being guessed.
 */
export function parseLocalAbsolutePath(value: string): LocalAbsolutePath | null {
	const raw = String(value || "").trim();
	if (!raw) return null;
	if (/^file:/iu.test(raw)) {
		let url: URL;
		try {
			url = new URL(raw);
		} catch {
			return { kind: "invalid" };
		}
		if (url.hostname && url.hostname.toLowerCase() !== "localhost") {
			return { kind: "unsupported" };
		}
		let pathname = "";
		try {
			pathname = decodeURIComponent(url.pathname);
		} catch {
			return { kind: "invalid" };
		}
		// file:///C:/dir/file names a Windows drive path.
		return localAbsolutePath(/^\/[a-z]:\//iu.test(pathname) ? pathname.slice(1) : pathname);
	}
	// "\\server\share" (CommonMark turns the leading "\\" into "\") and
	// drive-relative "\dir" have no drive letter to resolve against.
	if (raw.startsWith("\\")) return { kind: "unsupported" };
	// The Platform HTTP API is a transport, never a file address.
	if (/^\/api(?:[/?#]|$)/iu.test(raw)) return null;
	if (/^[a-z]:[\\/]/iu.test(raw) || (raw.startsWith("/") && !raw.startsWith("//"))) {
		return localAbsolutePath(raw);
	}
	return null;
}

/**
 * Markdown passes these targets through literally instead of URL-encoding
 * them, so the viewer receives the exact path the author wrote.
 */
export function isLiteralFileTarget(value: string): boolean {
	const raw = String(value || "").trim();
	return hasFileAlias(raw, CHAT_FILE_ALIAS) ||
		hasFileAlias(raw, WORKSPACE_FILE_ALIAS) ||
		raw.startsWith("\\") ||
		/^[a-z]:[\\/]/iu.test(raw) ||
		(raw.startsWith("/") && !raw.startsWith("//"));
}

/**
 * Splits a trailing ":<line>" location. A trailing ":<line>:<column>" keeps
 * the line and ignores the column.
 */
export function splitFileLocation(value: string): { filePath: string; line?: number } {
	const match = /^(.+?):(\d+)(?::\d+)?$/u.exec(value);
	if (!match) return { filePath: value };
	const line = Number.parseInt(match[2], 10);
	return Number.isSafeInteger(line) && line > 0
		? { filePath: match[1], line }
		: { filePath: match[1] };
}

/**
 * The trusted location of the document that owns a Markdown preview. Only a
 * document with a known source has one; chat messages never do, so a bare
 * relative path there still names no file.
 */
export interface DocumentLinkBase {
	scope: "workspace" | "chat";
	/** Path of the document itself: Workspace path (relative or host absolute) or Chat-relative path. */
	path: string;
}

function decodeLinkSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		// A literal percent sign is an ordinary character.
		return segment;
	}
}

/**
 * Resolves a relative link written inside a document against that document's
 * own directory and returns a scoped file address. The link is standard
 * Markdown (percent-encoded), so its segments are decoded once. Anything that
 * is not a plain relative path, or that climbs out of the document's root, is
 * not resolved; recognition is not permission and Platform still authorizes
 * the read.
 */
export function resolveDocumentRelativeLink(
	href: string | undefined,
	base: DocumentLinkBase | undefined,
): string | null {
	const raw = String(href || "").trim();
	if (!base || !raw) return null;
	if (/^[#?/\\@]/u.test(raw) || /^[a-z][a-z\d+.-]*:/iu.test(raw)) return null;
	// A link to another file cannot carry a heading anchor or query through.
	const target = raw.split(/[?#]/u, 1)[0];
	if (!target || target.endsWith("/")) return null;

	const basePath = String(base.path || "").trim().replace(/\\/gu, "/");
	const root = /^(?:[a-z]:)?\//iu.exec(basePath)?.[0] ?? "";
	if (base.scope === "chat" && root) return null;
	const segments = basePath.slice(root.length).split("/").filter(Boolean);
	if (!segments.length) return null;
	segments.pop();

	for (const part of target.replace(/\\/gu, "/").split("/")) {
		if (!part || part === ".") continue;
		const segment = decodeLinkSegment(part);
		if (segment === "..") {
			if (!segments.length) return null;
			segments.pop();
			continue;
		}
		if (segment === "." || /[/\\\u0000-\u001f\u007f]/u.test(segment)) return null;
		segments.push(segment);
	}
	if (!segments.length) return null;
	const resolved = segments.join("/");
	if (resolved.length > MAX_FILE_PATH_LENGTH) return null;
	if (root) return `${root}${resolved}`;
	return `${base.scope === "chat" ? CHAT_FILE_ALIAS : WORKSPACE_FILE_ALIAS}${resolved}`;
}

export function formatChatFileAddress(relativePath: string): string {
	return `${CHAT_FILE_ALIAS}${relativePath}`;
}

export function formatWorkspaceFileAddress(relativePath: string, line?: number): string {
	const location = Number.isSafeInteger(line) && Number(line) > 0 ? `:${line}` : "";
	return `${WORKSPACE_FILE_ALIAS}${relativePath}${location}`;
}
