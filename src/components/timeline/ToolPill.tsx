import React, { useState } from "react";
import type { TimelineNode } from "../../context/types";
import { UiButton } from "../ui/UiButton";
import { UiSection, UiSectionBody, UiSectionHead } from "../ui/UiSection";
import { resolveToolLabel } from "../../lib/toolDisplay";

interface ToolPillProps {
	node: TimelineNode;
}

export const ToolPill: React.FC<ToolPillProps> = ({ node }) => {
	const [expanded, setExpanded] = useState(false);

	const toolLabel = resolveToolLabel(node);
	const status = node.status || "pending";
	const statusLabel =
		status === "running"
			? "运行中"
			: status === "completed"
				? "完成"
				: status === "failed" || status === "error"
					? "失败"
					: status;

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
				{node.description && (
					<UiSection className="tool-section">
						<UiSectionHead className="tool-section-head">
							<span className="tool-section-title">
								DESCRIPTION
							</span>
						</UiSectionHead>
						<UiSectionBody className="tool-section-body">
							{node.description}
						</UiSectionBody>
					</UiSection>
				)}

				{node.argsText && (
					<UiSection className="tool-section">
						<UiSectionHead className="tool-section-head">
							<span className="tool-section-title">
								ARGUMENTS
							</span>
						</UiSectionHead>
						<pre className="tool-section-body is-code">
							{node.argsText}
						</pre>
					</UiSection>
				)}

				{node.result && (
					<UiSection className="tool-section">
						<UiSectionHead className="tool-section-head">
							<span className="tool-section-title">RESULT</span>
						</UiSectionHead>
						<pre
							className={`tool-section-body ${node.result.isCode ? "is-code" : ""}`}
						>
							{node.result.text}
						</pre>
					</UiSection>
				)}
			</div>
		</div>
	);
};
