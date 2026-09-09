import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { ComposerArea } from "@/features/composer/components/ComposerArea";
import { PlanPanel } from "@/features/plan/components/PlanPanel";
import { FrontendToolContainer } from "@/features/tools/components/FrontendToolContainer";
import { ArtifactPanel } from "@/features/artifacts/components/ArtifactPanel";
import { areConversationInteractionsBlocked } from "@/features/conversation/lib/chatTransition";
import { useConversationSurface } from "@/shared/ui/ConversationSurfaceContext";
import { ConversationRegionSkeleton } from "@/features/conversation/components/ConversationRegionSkeleton";

interface BottomDockProps {
	mode?: "desktop" | "copilot";
}

const BOTTOM_DOCK_CLASS_BY_MODE = {
	desktop: "bottom-dock",
	copilot:
		"bottom-dock tw:relative tw:bottom-auto tw:z-[22] tw:row-start-3 tw:min-w-0 tw:border-t tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-base)_94%,transparent)] tw:px-2 tw:pt-1.5 tw:[html[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--bg-base)_94%,transparent)]",
} as const;
const BOTTOM_DOCK_INNER_CLASS_BY_MODE = {
	desktop: "bottom-dock-inner",
	copilot: "bottom-dock-inner tw:max-w-none",
} as const;
const BOTTOM_DOCK_STACK_CLASS_BY_MODE = {
	desktop: "bottom-dock-stack",
	copilot: "bottom-dock-stack tw:gap-2",
} as const;

export const BottomDock: React.FC<BottomDockProps> = ({ mode = "desktop" }) => {
	const state = useAppState();
	const isCopilot = mode === "copilot";
	const presentation = useConversationSurface();
	const transitionBlocking = presentation?.blocked ?? areConversationInteractionsBlocked(state);

	return (
		<div className={BOTTOM_DOCK_CLASS_BY_MODE[mode]}>
			<div className={BOTTOM_DOCK_INNER_CLASS_BY_MODE[mode]}>
				<div className={BOTTOM_DOCK_STACK_CLASS_BY_MODE[mode]}>
					{transitionBlocking && !presentation?.error && (
						<ConversationRegionSkeleton region="plan-tasks" phase={presentation?.phase} />
					)}
					{!transitionBlocking && (
						<div className="bottom-dock-artifact-rail">
							<ArtifactPanel />
						</div>
					)}
					{!transitionBlocking && state.plan && (
						<div className="bottom-dock-plan-rail">
							<PlanPanel />
						</div>
					)}
					{!transitionBlocking && state.activeFrontendTool && (
						<div className="bottom-dock-tool-rail">
							<FrontendToolContainer />
						</div>
					)}
					<fieldset className="bottom-dock-composer-rail" disabled={transitionBlocking}
						aria-disabled={transitionBlocking} {...(transitionBlocking ? { inert: "" } : {})}
						style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
						<ComposerArea
							emptyInputMinRows={isCopilot ? 3 : undefined}
							inputMaxRows={isCopilot ? 6 : undefined}
							showWonders={!isCopilot}
						/>
					</fieldset>
				</div>
			</div>
		</div>
	);
};
