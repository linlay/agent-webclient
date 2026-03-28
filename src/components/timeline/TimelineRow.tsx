import React from "react";
import type { TimelineNode } from "../../context/types";
import { UserBubble } from "./UserBubble";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolPill } from "./ToolPill";
import { ContentBlock } from "./ContentBlock";
import { SystemAlert } from "./SystemAlert";
import { MaterialIcon } from "../common/MaterialIcon";

interface TimelineRowProps {
	node: TimelineNode;
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

function formatAttachmentSize(size?: number): string {
	if (!Number.isFinite(size) || Number(size) <= 0) {
		return "";
	}

	const units = ["B", "KB", "MB", "GB"];
	let value = Number(size);
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const precision = value >= 100 || unitIndex === 0 ? 0 : 1;
	return `${value.toFixed(precision)} ${units[unitIndex]}`;
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

const SteerIcon: React.FC = () => {
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
	return "/steer";
}

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
	showTime = false,
	metaNode,
}) => {
	const time = formatTimelineTime(node.ts);
	const timeNode =
		metaNode ||
		(showTime && time.short ? (
			<div className="timeline-row-time" title={time.full}>
				{time.short}
			</div>
		) : null);

	/* User messages */
	if (
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

		return (
			<div
				className="timeline-row timeline-row-user"
				data-kind="message"
				data-role="user"
			>
				<div className="timeline-user-stack">
					{hasText && <UserBubble text={node.text || ""} />}
					{attachmentItems.length > 0 && (
						<div className="timeline-user-attachments">
							{attachmentItems.map((attachment, index) => {
								const attachmentSize = formatAttachmentSize(
									attachment.size,
								);
								return (
									<div
										key={`${attachment.name}_${index}`}
										className="timeline-user-attachment"
									>
										<span className="timeline-user-attachment-icon">
											<MaterialIcon name="attach_file" />
										</span>
										<span
											className="timeline-user-attachment-name"
											title={attachment.name}
										>
											{attachment.name}
										</span>
										{attachmentSize && (
											<span className="timeline-user-attachment-size">
												{attachmentSize}
											</span>
										)}
									</div>
								);
							})}
						</div>
					)}
					{timeNode}
				</div>
			</div>
		);
	}

	if (
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
	if (node.kind === "message" && node.role === "system") {
		return (
			<div
				className="timeline-row timeline-row-flow"
				data-kind="message"
				data-role="system"
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
	if (node.kind === "thinking") {
		return (
			<div
				className="timeline-row timeline-row-flow"
				data-kind="thinking"
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

	/* Tool */
	if (node.kind === "tool") {
		return (
			<div className="timeline-row timeline-row-flow" data-kind="tool">
				<div className="timeline-marker">
					<NodeIcon kind="tool" />
				</div>
				<div className="timeline-flow-content">
					<ToolPill node={node} />
					{timeNode}
				</div>
			</div>
		);
	}

	/* Content */
	if (node.kind === "content") {
		return (
			<div className="timeline-row timeline-row-flow" data-kind="content">
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
			data-kind={node.kind}
			data-role={node.role}
		>
			<div className="timeline-marker">
				<NodeIcon kind={node.kind} role={node.role} />
			</div>
			<div className="timeline-flow-content">
				<ContentBlock node={node} />
				{timeNode}
			</div>
		</div>
	);
};
