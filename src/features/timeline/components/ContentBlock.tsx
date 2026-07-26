import React from "react";
import type { TimelineNode } from "@/app/state/types";
import {
	getAttachmentPreviewKind,
	type AttachmentPreviewState,
} from "@/features/artifacts/lib/attachmentPreview";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { stripPendingSpecialFenceTail } from "@/features/events/lib/contentSegments";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import {
	MarkdownContent,
	type MarkdownWebLink,
	type WorkspaceFileLink,
} from "@/shared/ui/MarkdownContent";
import { ViewportEmbed } from "@/features/timeline/components/ViewportEmbed";
import { isVoiceEnabled } from "@/shared/config/featureFlags";
import { resolvePreferredAgentKey } from "@/features/composer/lib/queryRouting";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import { useTimelineInteraction } from "./TimelineInteractionContext";

interface ContentBlockProps {
	node: TimelineNode;
}

const TIMELINE_CONTENT_STACK_CLASS_NAME =
	"timeline-content-stack tw:mt-1 tw:flex tw:flex-col tw:gap-1.5";
const TIMELINE_TEXT_CLASS_NAME =
	"timeline-text tw:break-words tw:text-[13px] tw:leading-[1.58] tw:text-ink-1";
const TIMELINE_MARKDOWN_CLASS_NAME = "timeline-markdown tw:whitespace-normal";
const TIMELINE_CONTENT_MARKDOWN_CLASS_NAME =
	"tw:max-w-[74ch] tw:text-[15px] tw:leading-[1.72]";
const TTS_VOICE_SECTION_CLASS_NAME = "tw:my-2";
const TTS_VOICE_TOOLBAR_CLASS_NAME = "tw:flex tw:items-center tw:gap-2";
const TTS_VOICE_PILL_CLASS_NAME =
	"tw:!flex tw:!w-auto tw:!cursor-pointer tw:!items-center tw:!justify-between tw:!gap-2 tw:!rounded-xl tw:!border tw:!border-[color-mix(in_srgb,var(--accent-electric)_24%,var(--line-soft))] tw:!bg-[color-mix(in_srgb,var(--bg-elev-2)_94%,var(--bg-input))] tw:!px-2.5 tw:!py-2";
const TTS_VOICE_REPLAY_CLASS_NAME = "tw:flex-none";
const TTS_VOICE_LABEL_CLASS_NAME =
	"tw:text-xs tw:uppercase tw:text-accent-electric-strong";
const TTS_VOICE_STATUS_CLASS_NAME = "tw:ml-auto tw:text-xs tw:text-ink-2";
const TTS_VOICE_CHEVRON_CLASS_NAME =
	"tw:inline-flex tw:text-ink-muted tw:transition-transform tw:duration-200 tw:ease-in-out";
const TTS_VOICE_CHEVRON_OPEN_CLASS_NAME = "tw:rotate-90";
const TTS_VOICE_DETAIL_CLASS_NAME =
	"tw:max-h-0 tw:overflow-hidden tw:transition-[max-height] tw:duration-200 tw:ease-in-out";
const TTS_VOICE_DETAIL_OPEN_CLASS_NAME = "tw:mt-2 tw:max-h-[260px]";
const TTS_VOICE_TEXT_CLASS_NAME =
	"tw:whitespace-pre-wrap tw:break-words tw:rounded-[10px] tw:bg-[color-mix(in_srgb,var(--bg-input)_86%,var(--bg-elev-2))] tw:px-3 tw:py-2.5 tw:text-[13px] tw:leading-[1.5]";

function displayFileName(filePath: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	return normalized.split("/").filter(Boolean).pop() || filePath;
}

export function buildWorkspaceFilePreview(
	link: WorkspaceFileLink,
	agentKey: string,
): AttachmentPreviewState {
	const name = displayFileName(link.filePath);
	const detectedKind = getAttachmentPreviewKind({ name });
	const kind = detectedKind === "unsupported" ? "text" : detectedKind;
	const previewKey = [
		"workspace-file",
		encodeURIComponent(agentKey),
		encodeURIComponent(link.filePath),
		link.line || "",
	].join(":");
	return {
		name,
		url: previewKey,
		downloadUrl: "",
		kind,
		sourcePath: link.filePath,
		line: link.line,
		workspaceFile: {
			agentKey,
			path: link.filePath,
		},
	};
}

export const ContentBlock: React.FC<ContentBlockProps> = ({ node }) => {
	const { t } = useI18n();
	const dispatch = useAppDispatch();
	const state = useAppState();
	const interaction = useTimelineInteraction();
	const voiceEnabled = isVoiceEnabled();
	const text = node.text || "";
	const streamingSafeText = stripPendingSpecialFenceTail(text);
	const markdownClassName = [
		TIMELINE_TEXT_CLASS_NAME,
		TIMELINE_MARKDOWN_CLASS_NAME,
		node.kind === "content" ? TIMELINE_CONTENT_MARKDOWN_CLASS_NAME : "",
	]
		.filter(Boolean)
		.join(" ");

	const segments = node.segments;
	const hasSpecialSegment = segments?.some((s) => s.kind !== "text");
	const workspaceFileAgentKey = React.useMemo(
		() => resolvePreferredAgentKey(state),
		[state],
	);
	const handleWorkspaceFileLinkClick = React.useCallback(
		(link: WorkspaceFileLink) => {
			dispatch({
				type: "OPEN_RIGHT_SIDEBAR",
				tab: "preview",
				preview: buildWorkspaceFilePreview(
					link,
					workspaceFileAgentKey,
				),
			});
		},
		[dispatch, workspaceFileAgentKey],
	);
	const handleWebLinkClick = React.useCallback(
		(link: MarkdownWebLink) => {
			dispatch({
				type: "OPEN_RIGHT_SIDEBAR",
				tab: "web",
				webPreview: {
					title: link.title,
					url: link.url,
				},
			});
		},
		[dispatch],
	);

	/* Simple case: no special segments, just markdown */
	if (!hasSpecialSegment) {
		return (
			<div className={TIMELINE_CONTENT_STACK_CLASS_NAME}>
				<div className={markdownClassName}>
					<MarkdownContent
						content={streamingSafeText}
						onWorkspaceFileLinkClick={handleWorkspaceFileLinkClick}
						onWebLinkClick={handleWebLinkClick}
					/>
				</div>
			</div>
		);
	}

	/* With viewport segments */
	return (
		<div className={TIMELINE_CONTENT_STACK_CLASS_NAME}>
			{segments?.map((segment, idx) => {
				if (segment.kind === "text") {
					return (
						<div
							key={idx}
							className={markdownClassName}
						>
							<MarkdownContent
								content={segment.text || ""}
								onWorkspaceFileLinkClick={
									handleWorkspaceFileLinkClick
								}
								onWebLinkClick={handleWebLinkClick}
							/>
						</div>
					);
				}

				if (segment.kind === "viewport") {
					return (
						<ViewportEmbed
							key={segment.signature || idx}
							viewportKey={segment.key || ""}
							signature={segment.signature || ""}
							payload={segment.payload}
							payloadRaw={segment.payloadRaw}
						/>
					);
				}

				if (segment.kind === "ttsVoice") {
					if (!voiceEnabled) {
						return null;
					}
					const signature = segment.signature || "";
					const voiceBlock = node.ttsVoiceBlocks?.[signature];
					const expanded = Boolean(voiceBlock?.expanded);
					const status = String(voiceBlock?.status || "ready");
					const statusText = voiceBlock?.error
						? `error: ${voiceBlock.error}`
						: status;
					const blockText = String(
						voiceBlock?.text || segment.text || "",
					).trim();

					return (
						<section
							key={signature || idx}
							className={TTS_VOICE_SECTION_CLASS_NAME}
						>
							<div className={TTS_VOICE_TOOLBAR_CLASS_NAME}>
								<UiButton
									className={TTS_VOICE_PILL_CLASS_NAME}
									variant="secondary"
									size="sm"
									data-voice-status={status}
									aria-expanded={expanded}
									onClick={() => {
										const blocks = {
											...(node.ttsVoiceBlocks || {}),
										};
										const nextBlock =
											blocks[signature] || {
												signature,
												text: String(
													segment.text || "",
												),
												closed: Boolean(
													segment.closed,
												),
												expanded: false,
												status: "ready" as const,
												error: "",
											};
										blocks[signature] = {
											...nextBlock,
											expanded: !expanded,
										};
						const nextNode = {
							...node,
							ttsVoiceBlocks: blocks,
						};
						if (interaction?.patchNode) {
							interaction.patchNode(nextNode);
						} else {
							dispatch({
								type: "SET_TIMELINE_NODE",
								id: node.id,
								node: nextNode,
							});
						}
									}}
								>
									<span className={TTS_VOICE_LABEL_CLASS_NAME}>
										{t("contentBlock.ttsVoice")}
									</span>
									<span className={TTS_VOICE_STATUS_CLASS_NAME}>
										{statusText}
									</span>
									<MaterialIcon
										name="chevron_right"
										className={`${TTS_VOICE_CHEVRON_CLASS_NAME} ${expanded ? TTS_VOICE_CHEVRON_OPEN_CLASS_NAME : ""}`}
									/>
								</UiButton>
								<UiButton
									className={TTS_VOICE_REPLAY_CLASS_NAME}
									variant="ghost"
									size="sm"
									iconOnly
									title={t("contentBlock.replayVoice")}
									aria-label={t("contentBlock.replayVoice")}
									onClick={() => {
										const runtime =
											getVoiceRuntime();
										if (!runtime) return;
										void runtime
											.replayTtsVoiceBlock(
												node.contentId || "",
												signature,
												voiceBlock?.text ||
													segment.text ||
													"",
											)
											.catch(() => undefined);
									}}
								>
									<MaterialIcon name="volume_up" />
								</UiButton>
							</div>
							<div
								className={`${TTS_VOICE_DETAIL_CLASS_NAME} ${expanded ? TTS_VOICE_DETAIL_OPEN_CLASS_NAME : ""}`}
							>
								<div className={TTS_VOICE_TEXT_CLASS_NAME}>
									{blockText || "(empty)"}
								</div>
							</div>
						</section>
					);
				}

				return null;
			})}
		</div>
	);
};
