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

const NodeIcon: React.FC<{
	kind: string;
	role?: string;
	messageVariant?: TimelineNode["messageVariant"];
}> = ({
	kind,
	role,
	messageVariant,
}) => {
	if (messageVariant === "steer") {
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
		node.messageVariant !== "steer"
	) {
		return (
			<div
				className="timeline-row timeline-row-user"
				data-kind="message"
				data-role="user"
			>
				<div className="timeline-user-stack">
					<UserBubble text={node.text || ""} />
					{timeNode}
				</div>
			</div>
		);
	}

	if (
		node.kind === "message" &&
		node.role === "user" &&
		node.messageVariant === "steer"
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
					<UserBubble text={node.text || ""} variant="steer" />
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
