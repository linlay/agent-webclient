import React, { useState } from "react";
import type { TimelineNode } from "../../context/types";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";

interface ThinkingBlockProps {
	node: TimelineNode;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ node }) => {
	const [expanded, setExpanded] = useState(node.expanded ?? false);

	const text = node.text || "";
	const isLoading = node.status === "running" || node.status === "streaming";

	return (
		<div>
			<UiButton
				className={`thinking-trigger ${expanded ? "is-open" : ""}`}
				variant="ghost"
				size="sm"
				onClick={() => setExpanded(!expanded)}
			>
				{isLoading ? "思考中..." : "思考过程"}
				<MaterialIcon name="chevron_right" className="chevron" />
			</UiButton>
			<div className={`thinking-detail ${expanded ? "is-open" : ""}`}>
				{text}
			</div>
		</div>
	);
};
