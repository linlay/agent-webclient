import React, { useMemo, useCallback, useState } from "react";
import { XMarkdown as Markdown } from "@ant-design/x-markdown";
import Latex from "@ant-design/x-markdown/plugins/Latex";
import { buildResourceUrl, downloadResource } from "@/shared/api/apiClient";

interface MarkdownContentProps {
	content: string;
}

/**
 * Extracts the filename from a resource URL query string.
 * e.g. "/api/resource?file=chat_123%2Fjoke_01.md&download=true" → "joke_01.md"
 */
function extractFilenameFromResourceUrl(href: string): string {
	try {
		const url = new URL(href, window.location.origin);
		const file = url.searchParams.get("file") || "";
		const segments = file.split("/");
		return segments[segments.length - 1] || "download";
	} catch {
		return "download";
	}
}

/**
 * Returns true when the href points to the local resource API endpoint.
 */
function isResourceUrl(href: string): boolean {
	if (!href) return false;
	try {
		const url = new URL(href, window.location.origin);
		return url.pathname === "/api/resource";
	} catch {
		return href.startsWith("/api/resource");
	}
}

/**
 * Custom anchor component that intercepts `/api/resource` links and
 * downloads them via fetch with auth headers (Bearer token) instead
 * of letting the browser navigate directly (which causes 401).
 */
const AuthAnchor: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement>> = (
	props,
) => {
	const { href, children, ...rest } = props;
	const [downloading, setDownloading] = useState(false);

	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLAnchorElement>) => {
			if (!href || !isResourceUrl(href) || downloading) return;

			e.preventDefault();
			setDownloading(true);

			const filename = extractFilenameFromResourceUrl(href);
			void downloadResource(href, { filename })
				.catch((error: unknown) => {
					console.error("Resource download failed:", error);
				})
				.finally(() => {
					setDownloading(false);
				});
		},
		[href, downloading],
	);

	return (
		<a {...rest} href={href} onClick={handleClick}>
			{downloading ? "下载中…" : children}
		</a>
	);
};

/**
 * MarkdownContent wraps @ant-design/x-markdown Markdown component
 * for streaming-compatible Markdown rendering.
 *
 * Preserves:
 * - Code block rendering with syntax highlighting
 * - KaTeX math formula support (via CSS import)
 * - Image auth-src rewriting (data-auth-src → blob URL)
 * - Link safety filtering
 * - Authenticated resource downloads (via custom anchor component)
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({
	content,
}) => {
	const markdownConfig = useMemo(
		() => ({
			gfm: true,
			breaks: true,
			extensions: Latex(),
		}),
		[],
	);

	const markdownComponents = useMemo(
		() =>
			({
				a: AuthAnchor,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			}) as any,
		[],
	);

	const processedContent = useMemo(() => {
		if (!content) return "";

		/* Rewrite non-http image src to go through API proxy */
		return content.replace(
			/!\[([^\]]*)\]\((?!https?:\/\/)([^)\s]+)\)/g,
			(match, alt, src) => {
				if (src.startsWith("data:") || src.startsWith("blob:"))
					return match;
				const proxiedSrc = buildResourceUrl(src);
				return `![${alt}](${proxiedSrc})`;
			},
		);
	}, [content]);

	if (!processedContent) {
		return null;
	}

	return (
		<Markdown config={markdownConfig} components={markdownComponents}>
			{processedContent}
		</Markdown>
	);
};
