import { bindCssModuleClasses } from "@/shared/utils/cssModuleClasses";
import timelinePresentation from "@/features/timeline/components/TimelinePresentation.module.css";
import React from "react";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import {
	buildResourceViewerTargetFromUrl,
} from "@/features/viewers/lib/viewerTarget";
import { stripPendingSpecialFenceTail } from "@/features/events/lib/contentSegments";
import type {
	MarkdownContentProps,
	MarkdownWebLink,
	ResourceFileLink,
	WorkspaceFileLink,
} from "@/features/viewers/components/MarkdownContent";
import { ConversationMarkdown } from "@/shared/ui/ConversationMarkdown";
import { ConversationMarkdownCode } from "@/shared/ui/markdown-code/ConversationMarkdownCode";
import { useI18n } from "@/shared/i18n";
import { useTimelineInteraction, useTimelineContextMenuTarget } from "./TimelineInteractionContext";
import { useTimelineCopy } from "./TimelineInteractionContext";
import { ViewHeader } from "./ViewHeader";
const presentationClasses = bindCssModuleClasses({ ...timelinePresentation });


interface ContentBlockProps {
	node: TimelineNode;
}

const TIMELINE_CONTENT_STACK_CLASS_NAME =
	"timeline-content-stack tw:flex tw:flex-col tw:gap-1.5";
const TIMELINE_TEXT_CLASS_NAME =
	"timeline-text tw:break-words tw:text-[13px] tw:leading-[1.58] tw:text-ink-1";
const TIMELINE_MARKDOWN_CLASS_NAME = presentationClasses("timeline-markdown tw:whitespace-normal");
const TIMELINE_CONTENT_MARKDOWN_CLASS_NAME =
	"tw:text-[15px] tw:leading-[1.72]";
export const ContentBlock: React.FC<ContentBlockProps> = ({ node }) => {
	const { t } = useI18n();
  const copyText = useTimelineCopy();
	const interaction = useTimelineInteraction();
	// Unrelated state/focus updates replace the context object. Depend on the
	// stable operation so Markdown anchors keep their DOM through the click.
	const openTarget = interaction?.openTarget;
	const surfaceContext = interaction?.surfaceContext;
	const text = node.text || "";
	const streamingSafeText = stripPendingSpecialFenceTail(text);
	const contextTarget = React.useMemo(() => ({
		targetId: `message:${node.id}`,
		kind: "message" as const,
		handlers: {
			"copy-content": () => copyText(text),
		},
	}), [copyText, node.id, text]);
	const contextTargetRef = useTimelineContextMenuTarget<HTMLDivElement>(contextTarget);
	const chatId = String(surfaceContext?.chatId || "").trim();
	const teamChat = Boolean(surfaceContext?.teamChat);
	const markdownClassName = [
		TIMELINE_TEXT_CLASS_NAME,
		TIMELINE_MARKDOWN_CLASS_NAME,
		node.kind === "content" ? TIMELINE_CONTENT_MARKDOWN_CLASS_NAME : "",
	]
		.filter(Boolean)
		.join(" ");

	const segments = node.segments;
	const hasSpecialSegment = segments?.some((s) => s.kind !== "text");
	const workspaceFileAgentKey = String(surfaceContext?.agentKey || "").trim();
	const handleWorkspaceFileLinkClick = React.useCallback(
		(link: WorkspaceFileLink) => {
			openTarget?.({
				version: 1,
				kind: "file",
				agentKey: workspaceFileAgentKey,
				path: link.filePath,
				line: link.line,
				toggle: true,
			});
		},
		[openTarget, workspaceFileAgentKey],
	);
	const handleWebLinkClick = React.useCallback(
		(link: MarkdownWebLink) => {
			openTarget?.({
				version: 1,
				kind: "web",
				url: link.url,
				title: link.title,
			});
		},
		[openTarget],
	);
	const handleResourceFileLinkClick = React.useCallback(
		(link: ResourceFileLink) => {
			const resourceTarget = buildResourceViewerTargetFromUrl(link.href);
			if (!resourceTarget) {
				return;
			}
			openTarget?.({
				version: 1,
				kind: "resource",
				agentKey: workspaceFileAgentKey,
				chatId,
				file: link.href,
				resourceTarget,
				title: link.name,
				toggle: true,
			});
		},
		[chatId, openTarget, workspaceFileAgentKey],
	);
	const renderMarkdown = (props: MarkdownContentProps) => {
		const isStreaming = Boolean(interaction?.conversationActive && node.status !== "completed" && node.status !== "failed");
		return interaction?.renderMarkdown?.({ ...props, agentKey: workspaceFileAgentKey, isStreaming })
			?? <ConversationMarkdown content={props.content} isStreaming={isStreaming} codeComponent={ConversationMarkdownCode} />;
	};

	/* Simple case: no special segments, just markdown */
	if (!hasSpecialSegment) {
		return (
			<div ref={contextTargetRef} className={TIMELINE_CONTENT_STACK_CLASS_NAME}>
      {node.status === "failed" && <div role="status">{t("timeline.content.interrupted")}：{node.errorDetail?.message}</div>}
				<div className={markdownClassName}>
					{renderMarkdown({
						content: streamingSafeText, chatId, teamChat,
						onWorkspaceFileLinkClick: handleWorkspaceFileLinkClick,
						onResourceFileLinkClick: handleResourceFileLinkClick,
						onWebLinkClick: handleWebLinkClick,
					})}
				</div>
			</div>
		);
	}

	/* With viewport segments */
	return (
		<div ref={contextTargetRef} className={TIMELINE_CONTENT_STACK_CLASS_NAME}>
      {node.status === "failed" && <div role="status">{t("timeline.content.interrupted")}：{node.errorDetail?.message}</div>}
			{segments?.map((segment, idx) => {
				if (segment.kind === "text") {
					return (
						<div
							key={idx}
							className={markdownClassName}
						>
							{renderMarkdown({
								content: segment.text || "", chatId, teamChat,
								onWorkspaceFileLinkClick: handleWorkspaceFileLinkClick,
								onResourceFileLinkClick: handleResourceFileLinkClick,
								onWebLinkClick: handleWebLinkClick,
							})}
						</div>
					);
				}

				if (segment.kind === "view") {
					// Only the platform binding names the frozen snapshot. Without one,
					// wait while the content streams, then fall back to the raw block.
					const binding = segment.closed && segment.index !== undefined ? node.viewBindings?.[segment.index] : undefined;
					const settled = node.status === "completed" || node.status === "failed";
					if (binding && interaction?.renderContentView) {
						return <React.Fragment key={segment.signature}>{interaction.renderContentView(segment, chatId, binding, node.runId, node.contentId)}</React.Fragment>;
					}
					if (!settled && interaction?.renderContentView && interaction.conversationActive) {
						return <div key={segment.signature} className="tw:my-2"><ViewHeader dynamic /><div role="status" className="tw:text-sm tw:opacity-70">{t("view.loading")}</div></div>;
					}
					return (
						<div key={segment.signature || idx} className={markdownClassName}>
							<ViewHeader dynamic />
							{renderMarkdown({ content: segment.text || "", chatId, teamChat })}
						</div>
					);
				}


				return null;
			})}
		</div>
	);
};
