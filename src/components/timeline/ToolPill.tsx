import React, { useState } from "react";
import type { TimelineNode } from "../../context/types";
import type { TimelineRenderEntry } from "../../lib/timelineDisplay";
import { UiButton } from "../ui/UiButton";
import { UiSection, UiSectionBody, UiSectionHead } from "../ui/UiSection";
import { resolveToolLabel } from "../../lib/toolDisplay";

type ToolGroupRenderEntry = Extract<TimelineRenderEntry, { kind: "tool-group" }>;

interface ToolPillProps {
	node?: TimelineNode;
	toolGroup?: ToolGroupRenderEntry;
}

export interface ToolPillRecord {
	key: string;
	title: string;
	status: string;
	statusLabel: string;
	description: string;
	argsText: string;
	result: TimelineNode["result"];
}

function resolveStatusLabel(status?: string): string {
	const value = status || "pending";
	return value === "running"
		? "运行中"
		: value === "completed"
			? "完成"
			: value === "failed" || value === "error"
				? "失败"
				: value;
}

export function formatToolPillTitle(
	source: TimelineNode | ToolGroupRenderEntry,
): string {
	if ("kind" in source && source.kind === "tool-group") {
		const baseLabel = resolveToolLabel({
			toolLabel: source.toolLabel,
			toolName: source.toolName,
		});
		return source.count > 1 ? `${baseLabel} x${source.count}` : baseLabel;
	}

	return resolveToolLabel(source);
}

export function buildToolPillRecords(
	source: TimelineNode | ToolGroupRenderEntry,
): ToolPillRecord[] {
	const nodes =
		"kind" in source && source.kind === "tool-group"
			? source.nodes
			: [source];

	return nodes.map((node, index) => {
		const status = node.status || "pending";
		return {
			key: node.id,
			title: `第 ${index + 1} 次`,
			status,
			statusLabel: resolveStatusLabel(status),
			description: node.description || "",
			argsText: node.argsText || "",
			result: node.result || null,
		};
	});
}

export const ToolPill: React.FC<ToolPillProps> = ({ node, toolGroup }) => {
	const [expanded, setExpanded] = useState(false);

	const source = toolGroup || node;
	if (!source) return null;

	const toolLabel = formatToolPillTitle(source);
	const records = buildToolPillRecords(source);
	const isGrouped = Boolean(toolGroup && toolGroup.count > 1);
	const latestRecord = records[records.length - 1];
	const status = latestRecord?.status || "pending";

	return (
		<div>
			<UiButton
				className="tool-pill"
				variant="secondary"
				size="sm"
				data-tool-status={status}
				onClick={() => setExpanded(!expanded)}
			>
				<span className="tool-status-dot" />
				<span className="tool-pill-label" title={toolLabel}>
					{toolLabel}
				</span>
				{/* <span className="tool-pill-state">{statusLabel}</span> */}
			</UiButton>

			<div className={`tool-detail ${expanded ? "is-open" : ""}`}>
				{records.map((record) => (
					<div key={record.key}>
						{isGrouped && (
							<UiSection className="tool-section">
								<UiSectionHead className="tool-section-head">
									<span className="tool-section-title">
										{record.title}
									</span>
									<span className="tool-section-title">
										{record.statusLabel}
									</span>
								</UiSectionHead>
							</UiSection>
						)}

						{record.description && (
							<UiSection className="tool-section">
								<UiSectionHead className="tool-section-head">
									<span className="tool-section-title">
										DESCRIPTION
									</span>
								</UiSectionHead>
								<UiSectionBody className="tool-section-body">
									{record.description}
								</UiSectionBody>
							</UiSection>
						)}

						{record.argsText && (
							<UiSection className="tool-section">
								<UiSectionHead className="tool-section-head">
									<span className="tool-section-title">
										ARGUMENTS
									</span>
								</UiSectionHead>
								<pre className="tool-section-body is-code">
									{record.argsText}
								</pre>
							</UiSection>
						)}

						{record.result && (
							<UiSection className="tool-section">
								<UiSectionHead className="tool-section-head">
									<span className="tool-section-title">RESULT</span>
								</UiSectionHead>
								<pre
									className={`tool-section-body ${record.result.isCode ? "is-code" : ""}`}
								>
									{record.result.text}
								</pre>
							</UiSection>
						)}
					</div>
				))}
			</div>
		</div>
	);
};
