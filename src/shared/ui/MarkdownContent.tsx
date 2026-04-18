import React, { useMemo } from "react";
import { XMarkdown as Markdown } from "@ant-design/x-markdown";
import Latex from "@ant-design/x-markdown/plugins/Latex";
import { buildResourceUrl } from "@/shared/api/apiClient";

interface MarkdownContentProps {
	content: string;
}

/**
 * MarkdownContent wraps @ant-design/x-markdown Markdown component
 * for streaming-compatible Markdown rendering.
 *
 * Preserves:
 * - Code block rendering with syntax highlighting
 * - KaTeX math formula support (via CSS import)
 * - Image auth-src rewriting (data-auth-src → blob URL)
 * - Link safety filtering
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

	return <Markdown config={markdownConfig}>{processedContent}</Markdown>;
};
