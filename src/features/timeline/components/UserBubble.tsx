import React from "react";
import { useDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import { copyText } from "@/shared/utils/copy";

interface UserBubbleProps {
	text: string;
	variant?: "default" | "steer" | "remember" | "learn";
	targetId?: string;
}

const USER_BUBBLE_CLASS_NAME =
	"timeline-user-bubble tw:rounded-[14px_14px_4px_14px] tw:bg-accent tw:px-3.5 tw:py-2.5 tw:text-[#f8fcff] tw:shadow-[0_6px_16px_rgba(38,99,235,0.18)] tw:[html[data-theme=dark]_&]:border tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--accent-electric)_60%,transparent)] tw:[html[data-theme=dark]_&]:bg-[linear-gradient(140deg,#2558cf,#1d4ed8)] tw:[html[data-theme=dark]_&]:shadow-[0_6px_18px_rgba(8,24,56,0.28)]";
const USER_BUBBLE_COMMAND_CLASS_NAME =
	"is-command tw:w-fit tw:max-w-[min(100%,720px)]";
const USER_BUBBLE_TEXT_CLASS_NAME =
	"timeline-text tw:whitespace-pre-wrap tw:break-all tw:text-[13px] tw:leading-[1.58] tw:text-[#f8fcff]";

export const UserBubble: React.FC<UserBubbleProps> = ({
	text,
	variant = "default",
	targetId,
}) => {
	const fallbackId = React.useId();
	const contextTarget = React.useMemo(() => ({
		targetId: `message:${targetId || fallbackId}`,
		kind: "message" as const,
		handlers: {
			"copy-content": () => copyText(text),
		},
	}), [fallbackId, targetId, text]);
	const contextTargetRef = useDesktopContextMenuTarget<HTMLDivElement>(contextTarget);
	return (
		<div
			ref={contextTargetRef}
			className={[
				USER_BUBBLE_CLASS_NAME,
				variant !== "default" ? USER_BUBBLE_COMMAND_CLASS_NAME : "",
			]
				.filter(Boolean)
				.join(" ")}
		>
			<div className={USER_BUBBLE_TEXT_CLASS_NAME}>{text}</div>
		</div>
	);
};
