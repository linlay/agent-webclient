import React, { useMemo } from "react";
import type { TimelineNode } from "../../context/types";
import { useAppDispatch, useAppState } from "../../context/AppContext";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";

interface ThinkingBlockProps {
	node: TimelineNode;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ node }) => {
	const dispatch = useAppDispatch();
	const state = useAppState();
	const expanded = Boolean(node.expanded);
	const reasoningKey = useMemo(() => {
		for (const [key, nodeId] of state.reasoningNodeById.entries()) {
			if (nodeId === node.id) return key;
		}
		return "";
	}, [node.id, state.reasoningNodeById]);

	const text = node.text || "";
	const isLoading = node.status === "running" || node.status === "streaming";
	const triggerLabel = isLoading
		? node.reasoningLabel || "思考中..."
		: "思考过程";

	return (
		<div>
			<UiButton
				className={`thinking-trigger ${expanded ? "is-open" : ""}`}
				variant="ghost"
				size="sm"
				onClick={() => {
					if (reasoningKey) {
						const timer =
							state.reasoningCollapseTimers.get(reasoningKey);
						if (timer) {
							clearTimeout(timer);
							dispatch({
								type: "CLEAR_REASONING_COLLAPSE_TIMER",
								reasoningId: reasoningKey,
							});
						}
					}
					dispatch({
						type: "SET_TIMELINE_NODE",
						id: node.id,
						node: {
							...node,
							expanded: !expanded,
						},
					});
				}}
			>
				{triggerLabel}
				<MaterialIcon name="chevron_right" className="chevron" />
			</UiButton>
			<div className={`thinking-detail ${expanded ? "is-open" : ""}`}>
				{text}
			</div>
		</div>
	);
};
