import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { ComposerArea } from "@/features/composer/components/ComposerArea";
import { PlanPanel } from "@/features/plan/components/PlanPanel";
import { FrontendToolContainer } from "@/features/tools/components/FrontendToolContainer";
import { ArtifactPanel } from "@/features/artifacts/components/ArtifactPanel";

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

	return (
		<div className={BOTTOM_DOCK_CLASS_BY_MODE[mode]}>
			<div className={BOTTOM_DOCK_INNER_CLASS_BY_MODE[mode]}>
				<div className={BOTTOM_DOCK_STACK_CLASS_BY_MODE[mode]}>
					<div className="bottom-dock-artifact-rail">
						<ArtifactPanel />
					</div>
					{state.plan && (
						<div className="bottom-dock-plan-rail">
							<PlanPanel />
						</div>
					)}
					{state.activeFrontendTool && (
						<div className="bottom-dock-tool-rail">
							<FrontendToolContainer />
						</div>
					)}
					<div className="bottom-dock-composer-rail">
						<ComposerArea
							emptyInputMinRows={isCopilot ? 3 : undefined}
							inputMaxRows={isCopilot ? 6 : undefined}
							showWonders={!isCopilot}
						/>
					</div>
				</div>
			</div>
		</div>
	);
};
