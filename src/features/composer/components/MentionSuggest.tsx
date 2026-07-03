import React from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import { UiButton } from "@/shared/ui/UiButton";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";

const MENTION_SUGGEST_CLASS =
	"mention-suggest tw:absolute tw:bottom-full tw:left-0 tw:right-0 tw:z-10 tw:mb-1.5 tw:max-h-[260px] tw:overflow-y-auto tw:rounded-control tw:border tw:border-[color-mix(in_srgb,var(--line-soft)_96%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_98%,transparent)] tw:shadow-floating";
const MENTION_SUGGEST_LIST_CLASS = [
	"mention-suggest-list tw:p-1",
	SCROLLBAR_THIN_CLASS_NAME,
].join(" ");
const MENTION_ITEM_CLASS =
	"mention-item tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-2.5 tw:rounded-lg tw:border-0 tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:shadow-none tw:hover:!bg-bg-hover tw:active:transform-none";
const MENTION_ITEM_STATE_CLASS = {
	idle: "",
	active: "active tw:!bg-bg-hover",
} as const;
const MENTION_NAME_CLASS = "mention-name tw:text-xs tw:text-ink-muted";

export const MentionSuggest: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();

	if (!state.mentionOpen || state.mentionSuggestions.length === 0) {
		return null;
	}

	return (
		<div className={MENTION_SUGGEST_CLASS} id="mention-suggest">
			<div className={MENTION_SUGGEST_LIST_CLASS}>
				{state.mentionSuggestions.map((agent, index) => (
					<UiButton
						key={agent.key}
						className={`${MENTION_ITEM_CLASS} ${index === state.mentionActiveIndex ? MENTION_ITEM_STATE_CLASS.active : MENTION_ITEM_STATE_CLASS.idle}`}
						variant="ghost"
						size="sm"
						onClick={() => {
							window.dispatchEvent(
								new CustomEvent("agent:select-mention", {
									detail: {
										agentKey: agent.key,
										agentName: agent.name || "",
									},
								}),
							);
							dispatch({ type: "SET_MENTION_OPEN", open: false });
						}}
					>
						<span className={MENTION_NAME_CLASS}>
							{agent.name || agent.key}
						</span>
					</UiButton>
				))}
			</div>
		</div>
	);
};
