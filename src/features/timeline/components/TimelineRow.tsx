import React from "react";
import type { TimelineNode } from "@/app/state/types";
import type { TimelineRenderEntry } from "@/features/timeline/lib/timelineDisplay";
import {
	formatAttachmentSize,
	getAttachmentKind,
	getAttachmentKindLabel,
} from "@/features/artifacts/lib/attachmentUtils";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { UserBubble } from "@/features/timeline/components/UserBubble";
import { ThinkingBlock } from "@/features/timeline/components/ThinkingBlock";
import { AwaitingAnswerBlock } from "@/features/timeline/components/AwaitingAnswerBlock";
import { ToolPill } from "@/features/timeline/components/ToolPill";
import { ContentBlock } from "@/features/timeline/components/ContentBlock";
import { SystemAlert } from "@/features/timeline/components/SystemAlert";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

type ToolGroupRenderEntry = Extract<TimelineRenderEntry, { kind: "tool-group" }>;

interface TimelineRowProps {
	node?: TimelineNode;
	toolGroup?: ToolGroupRenderEntry;
	showTime?: boolean;
	metaNode?: React.ReactNode;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function isYesterday(target: Date, now: Date): boolean {
	const y = new Date(now);
	y.setHours(0, 0, 0, 0);
	y.setDate(y.getDate() - 1);
	return (
		target.getFullYear() === y.getFullYear() &&
		target.getMonth() === y.getMonth() &&
		target.getDate() === y.getDate()
	);
}

export function formatTimelineTime(ts?: number): { short: string; full: string } {
	if (!ts) return { short: "", full: "" };
	const target = new Date(ts);
	if (Number.isNaN(target.getTime())) return { short: "", full: "" };
	const now = new Date();
	const diffMs = now.getTime() - target.getTime();
	const dayCrossed = !isSameDay(target, now);
	const hhmm = timeFormatter.format(target);
	const full = dateTimeFormatter.format(target);

	if (diffMs > 24 * 60 * 60 * 1000) {
		return { short: full, full };
	}

	if (diffMs >= 0 && dayCrossed && isYesterday(target, now)) {
		return { short: `昨天 ${hhmm}`, full };
	}

	if (diffMs >= 0 && !dayCrossed) {
		return { short: `今天 ${hhmm}`, full };
	}

	return {
		short: hhmm,
		full,
	};
}

export const SteerIcon: React.FC = () => {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M3.5 4.5h5.25a3.75 3.75 0 1 1 0 7.5H6.5" />
			<path d="M7.5 2.75 3 4.5l4.5 1.75" />
			<path d="M6.5 12h3.25" />
		</svg>
	);
};

function isCommandMessageVariant(
	variant?: TimelineNode["messageVariant"],
): variant is "steer" | "remember" | "learn" {
	return (
		variant === "steer" || variant === "remember" || variant === "learn"
	);
}

function getCommandMessageLabel(
	variant?: TimelineNode["messageVariant"],
): string {
	if (variant === "remember") return "/remember";
	if (variant === "learn") return "/learn";
	return "";
}

function getTimelineAttachmentSubtitle(
	attachment: NonNullable<TimelineNode["attachments"]>[number],
	compact = false,
): string {
	if (compact) {
		return getAttachmentKindLabel(attachment);
	}

	const attachmentSize = formatAttachmentSize(attachment.size);
	if (
		getAttachmentKind(attachment) === "image" &&
		String(attachment.url || "").trim()
	) {
		return "";
	}

	return [getAttachmentKindLabel(attachment), attachmentSize]
		.filter(Boolean)
		.join(" · ");
}

interface TimelineAttachmentGroupProps {
	attachments: NonNullable<TimelineNode["attachments"]>;
}

const TimelineAttachmentGroup: React.FC<TimelineAttachmentGroupProps> = ({
	attachments,
}) => {
	const groupRef = React.useRef<HTMLDivElement>(null);
	const popoverId = React.useId();
	const [expanded, setExpanded] = React.useState(false);
	const leadAttachment = attachments[0];
	const remainingAttachments = attachments.slice(1);

	React.useEffect(() => {
		if (!expanded) {
			return;
		}

		const handlePointerDown = (event: MouseEvent | TouchEvent) => {
			const target = event.target;
			if (
				groupRef.current &&
				target instanceof Node &&
				!groupRef.current.contains(target)
			) {
				setExpanded(false);
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setExpanded(false);
			}
		};

		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("touchstart", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("touchstart", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [expanded]);

	if (!leadAttachment) {
		return null;
	}

	return (
		<div className="timeline-user-attachment-group" ref={groupRef}>
			<div className="timeline-user-attachment-group-top">
				<AttachmentCard
					attachment={leadAttachment}
					variant="timeline"
					density="compact"
					displayMode="file"
					subtitle={getTimelineAttachmentSubtitle(
						leadAttachment,
						true,
					)}
					trailingNode={
						remainingAttachments.length > 0 ? (
							<span
								className={`timeline-user-attachment-hint ${expanded ? "is-open" : ""}`.trim()}
								aria-hidden="true"
							>
								<MaterialIcon name="subdirectory_arrow_right" />
							</span>
						) : null
					}
				/>
				{remainingAttachments.length > 0 ? (
					<button
						type="button"
						className={`timeline-user-attachment-more ${expanded ? "is-open" : ""}`.trim()}
						aria-expanded={expanded}
						aria-controls={popoverId}
						aria-label={`查看剩余 ${remainingAttachments.length} 个附件`}
						title={`查看剩余 ${remainingAttachments.length} 个附件`}
						onClick={() => setExpanded((current) => !current)}
					>
						+{remainingAttachments.length}
					</button>
				) : null}
			</div>
			{expanded && remainingAttachments.length > 0 ? (
				<div
					className="timeline-user-attachment-popover"
					id={popoverId}
					role="dialog"
					aria-label="剩余附件"
				>
					<div className="timeline-user-attachment-popover-list">
						{remainingAttachments.map((attachment, index) => (
							<AttachmentCard
								key={`${attachment.name}_${index + 1}`}
								attachment={attachment}
								variant="timeline"
								density="compact"
								displayMode="file"
								subtitle={getTimelineAttachmentSubtitle(
									attachment,
									true,
								)}
							/>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
};

const NodeIcon: React.FC<{
	kind: string;
	role?: string;
	messageVariant?: TimelineNode["messageVariant"];
}> = ({
	kind,
	role,
	messageVariant,
}) => {
	if (isCommandMessageVariant(messageVariant)) {
		return (
			<span className="node-icon node-icon-steer">
				<SteerIcon />
			</span>
		);
	}

	let className = "node-icon";
	let iconName = "smart_toy";

	switch (kind) {
		case "thinking":
			className += " node-icon-thinking";
			iconName = "psychology";
			break;
		case "awaiting-answer":
			className += " node-icon-awaiting-answer";
			iconName = "question_answer";
			break;
		case "tool":
			className += " node-icon-tool";
			iconName = "build";
			break;
		case "content":
			className += " node-icon-content";
			iconName = "description";
			break;
		default:
			if (role === "system") {
				className += " node-icon-alert";
				iconName = "warning";
			} else {
				className += " node-icon-assistant";
				iconName = "smart_toy";
			}
	}

	return (
		<span className={className}>
			<MaterialIcon name={iconName} />
		</span>
	);
};

export const TimelineRow: React.FC<TimelineRowProps> = ({
	node,
	toolGroup,
	showTime = false,
	metaNode,
}) => {
	const timeTarget = node || toolGroup?.nodes[toolGroup.nodes.length - 1];
	if (!timeTarget) return null;
	const taskID = node?.taskId || toolGroup?.nodes.find((item) => item.taskId)?.taskId;

	const time = formatTimelineTime(timeTarget.ts);
	const timeNode =
		metaNode ||
		(showTime && time.short ? (
			<div className="timeline-row-time" title={time.full}>
				{time.short}
			</div>
		) : null);

	/* User messages */
	if (
		node &&
		node.kind === "message" &&
		node.role === "user" &&
		!isCommandMessageVariant(node.messageVariant)
	) {
		const attachmentItems = Array.isArray(node.attachments)
			? node.attachments.filter((attachment) =>
					Boolean(String(attachment?.name || "").trim()),
				)
			: [];
		const hasText = Boolean(String(node.text || "").trim());
		const hasMultipleAttachments = attachmentItems.length > 1;

		return (
			<div
				className="timeline-row timeline-row-user"
				data-kind="message"
				data-role="user"
				data-task-id={taskID || undefined}
			>
				<div className="timeline-user-stack">
					{attachmentItems.length > 0 && (
						<div
							className={`timeline-user-attachments ${hasMultipleAttachments ? "is-multi" : ""}`.trim()}
						>
							{hasMultipleAttachments ? (
								<TimelineAttachmentGroup
									attachments={attachmentItems}
								/>
							) : (
								attachmentItems.map((attachment, index) => (
									<AttachmentCard
										key={`${attachment.name}_${index}`}
										attachment={attachment}
										variant="timeline"
										subtitle={getTimelineAttachmentSubtitle(
											attachment,
										)}
									/>
								))
							)}
						</div>
					)}
					{hasText && <UserBubble text={node.text || ""} />}
					{timeNode}
				</div>
			</div>
		);
	}

	if (
		node &&
		node.kind === "message" &&
		node.role === "user" &&
		isCommandMessageVariant(node.messageVariant)
	) {
		return (
			<div
				className="timeline-row timeline-row-flow"
				data-kind="message"
				data-role="user"
				data-variant="steer"
				data-task-id={taskID || undefined}
			>
				<div className="timeline-marker">
					<NodeIcon
						kind="message"
						role="user"
						messageVariant={node.messageVariant}
					/>
				</div>
				<div className="timeline-flow-content">
					<div className="timeline-command-label">
						{getCommandMessageLabel(node.messageVariant)}
					</div>
					<UserBubble
						text={node.text || ""}
						variant={node.messageVariant}
					/>
					{timeNode}
				</div>
			</div>
		);
	}

	/* System alerts */
	if (node && node.kind === "message" && node.role === "system") {
		return (
			<div
				className="timeline-row timeline-row-flow"
				data-kind="message"
				data-role="system"
				data-task-id={taskID || undefined}
			>
				<div className="timeline-marker">
					<NodeIcon kind="message" role="system" />
				</div>
				<div className="timeline-flow-content">
					<SystemAlert text={node.text || ""} />
					{timeNode}
				</div>
			</div>
		);
	}

	/* Thinking */
	if (node && node.kind === "thinking") {
		return (
			<div
				className="timeline-row timeline-row-flow"
				data-kind="thinking"
				data-task-id={taskID || undefined}
			>
				<div className="timeline-marker">
					<NodeIcon kind="thinking" />
				</div>
				<div className="timeline-flow-content">
					<ThinkingBlock node={node} />
					{timeNode}
				</div>
			</div>
		);
	}

	/* Awaiting answer */
	if (node && node.kind === "awaiting-answer") {
		return (
			<div
				className="timeline-row timeline-row-flow"
				data-kind="awaiting-answer"
				data-task-id={taskID || undefined}
			>
				<div className="timeline-marker">
					<NodeIcon kind="awaiting-answer" />
				</div>
				<div className="timeline-flow-content">
					<AwaitingAnswerBlock node={node} />
					{timeNode}
				</div>
			</div>
		);
	}

	/* Tool */
	if (toolGroup || (node && node.kind === "tool")) {
		return (
			<div
				className="timeline-row timeline-row-flow"
				data-kind="tool"
				data-task-id={taskID || undefined}
			>
				<div className="timeline-marker">
					<NodeIcon kind="tool" />
				</div>
				<div className="timeline-flow-content">
					<ToolPill node={node} toolGroup={toolGroup} />
					{timeNode}
				</div>
			</div>
		);
	}

	/* Content */
	if (node && node.kind === "content") {
		return (
			<div
				className="timeline-row timeline-row-flow"
				data-kind="content"
				data-task-id={taskID || undefined}
			>
				<div className="timeline-marker">
					<NodeIcon kind="content" />
				</div>
				<div className="timeline-flow-content">
					<ContentBlock node={node} />
					{timeNode}
				</div>
			</div>
		);
	}

	/* Default assistant message */
	return (
		<div
			className="timeline-row timeline-row-flow"
			data-kind={node?.kind}
			data-role={node?.role}
			data-task-id={taskID || undefined}
		>
			<div className="timeline-marker">
				<NodeIcon kind={node?.kind || "message"} role={node?.role} />
			</div>
			<div className="timeline-flow-content">
				{node && <ContentBlock node={node} />}
				{timeNode}
			</div>
		</div>
	);
};
