import React from "react";
import type { TimelineNode } from "@/app/state/types";
import { useAppDispatch } from "@/app/state/AppContext";
import { stripPendingSpecialFenceTail } from "@/features/timeline/lib/contentSegments";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import { MarkdownContent } from "@/shared/ui/MarkdownContent";
import { ViewportEmbed } from "@/features/timeline/components/ViewportEmbed";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

interface ContentBlockProps {
	node: TimelineNode;
}

export const ContentBlock: React.FC<ContentBlockProps> = ({ node }) => {
	const dispatch = useAppDispatch();
	const text = node.text || "";
	const streamingSafeText = stripPendingSpecialFenceTail(text);

	const segments = node.segments;
	const hasSpecialSegment = segments?.some((s) => s.kind !== "text");

	/* Simple case: no special segments, just markdown */
	if (!hasSpecialSegment) {
		return (
			<div className="timeline-content-stack">
				<div className="timeline-text timeline-markdown">
					<MarkdownContent content={streamingSafeText} />
				</div>
			</div>
		);
	}

	/* With viewport segments */
	return (
		<div className="timeline-content-stack">
			{segments?.map((segment, idx) => {
				if (segment.kind === "text") {
					return (
						<div
							key={idx}
							className="timeline-text timeline-markdown"
						>
							<MarkdownContent content={segment.text || ""} />
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
							className="timeline-tts-voice"
						>
							<div className="tts-voice-toolbar">
								<UiButton
									className="tts-voice-pill"
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
										dispatch({
											type: "SET_TIMELINE_NODE",
											id: node.id,
											node: {
												...node,
												ttsVoiceBlocks: blocks,
											},
										});
									}}
								>
									<span className="tts-voice-label">
										tts voice
									</span>
									<span className="tts-voice-status">
										{statusText}
									</span>
									<MaterialIcon
										name="chevron_right"
										className="chevron"
									/>
								</UiButton>
								<UiButton
									className="tts-voice-replay"
									variant="ghost"
									size="sm"
									iconOnly
									title="重新朗读"
									aria-label="重新朗读"
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
								className={`tts-voice-detail ${expanded ? "is-open" : ""}`}
							>
								<div className="tts-voice-text">
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
