import React from "react";
import { useDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import { useI18n } from "@/shared/i18n";
import { copyText } from "@/shared/utils/copy";

interface UserBubbleProps {
	text: string;
	variant?: "default" | "steer" | "remember" | "learn";
	targetId?: string;
}

const USER_BUBBLE_COLLAPSED_MAX_HEIGHT = 300;

const USER_BUBBLE_CLASS_NAME =
	"timeline-user-bubble tw:rounded-[14px_14px_4px_14px] tw:bg-accent tw:px-3.5 tw:py-2.5 tw:text-[var(--accent-on)] tw:shadow-[0_6px_16px_rgba(38,99,235,0.18)] tw:[html[data-theme=dark]_&]:border tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--accent-electric)_60%,transparent)]  tw:[html[data-theme=dark]_&]:shadow-[0_6px_18px_rgba(8,24,56,0.28)]";
const USER_BUBBLE_COMMAND_CLASS_NAME =
	"is-command tw:w-fit tw:max-w-[min(100%,720px)]";
const USER_BUBBLE_TEXT_CLASS_NAME =
	"timeline-text tw:whitespace-pre-wrap tw:break-all tw:text-[14px] tw:leading-[1.58] tw:text-[var(--accent-on)]";
const USER_BUBBLE_TEXT_CLAMP_CLASS_NAME =
	"timeline-text-clamp tw:relative tw:max-h-[300px] tw:overflow-hidden";
const USER_BUBBLE_TEXT_FADE_CLASS_NAME =
	"timeline-text-fade tw:pointer-events-none tw:absolute tw:inset-x-0 tw:bottom-0 tw:h-12 tw:bg-[linear-gradient(to_bottom,transparent,var(--accent))] ";
const USER_BUBBLE_TOGGLE_CLASS_NAME =
	"timeline-user-bubble-toggle tw:mt-1 tw:block tw:ml-auto tw:w-fit tw:cursor-pointer tw:rounded-full tw:border-0 tw:bg-transparent tw:p-0 tw:text-xs tw:font-medium tw:text-[var(--accent-on)] tw:opacity-80 tw:shadow-none tw:hover:opacity-100";

export const UserBubble: React.FC<UserBubbleProps> = ({
	text,
	variant = "default",
	targetId,
}) => {
	const { t } = useI18n();
	const fallbackId = React.useId();
	const textRef = React.useRef<HTMLDivElement>(null);
	const [expandable, setExpandable] = React.useState(false);
	const [expanded, setExpanded] = React.useState(false);
	const contextTarget = React.useMemo(() => ({
		targetId: `message:${targetId || fallbackId}`,
		kind: "message" as const,
		handlers: {
			"copy-content": () => copyText(text),
		},
	}), [fallbackId, targetId, text]);
	const contextTargetRef = useDesktopContextMenuTarget<HTMLDivElement>(contextTarget);

	React.useLayoutEffect(() => {
		const el = textRef.current;
		if (!el || typeof ResizeObserver === "undefined") {
			return;
		}
		const updateExpandable = () => {
			setExpandable(el.offsetHeight > USER_BUBBLE_COLLAPSED_MAX_HEIGHT + 1);
		};
		updateExpandable();
		const observer = new ResizeObserver(updateExpandable);
		observer.observe(el);
		return () => observer.disconnect();
	}, [text]);

	const collapsed = expandable && !expanded;

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
			<div className={collapsed ? USER_BUBBLE_TEXT_CLAMP_CLASS_NAME : ""}>
				<div ref={textRef} className={USER_BUBBLE_TEXT_CLASS_NAME}>
					{text}
				</div>
				{collapsed ? <div className={USER_BUBBLE_TEXT_FADE_CLASS_NAME} /> : null}
			</div>
			{expandable ? (
				<button
					type="button"
					className={USER_BUBBLE_TOGGLE_CLASS_NAME}
					onClick={() => setExpanded((value) => !value)}
				>
					{expanded
						? t("timeline.userBubble.collapse")
						: t("timeline.userBubble.expand")}
				</button>
			) : null}
		</div>
	);
};
