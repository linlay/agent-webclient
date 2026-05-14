import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { ComposerArea } from "@/features/composer/components/ComposerArea";
import { PlanPanel } from "@/features/plan/components/PlanPanel";
import { FrontendToolContainer } from "@/features/tools/components/FrontendToolContainer";
import { ArtifactPanel } from "@/features/artifacts/components/ArtifactPanel";

interface BottomDockProps {
	mode?: "desktop" | "copilot";
}

export const BottomDock: React.FC<BottomDockProps> = ({ mode = "desktop" }) => {
	const state = useAppState();
	const isCopilot = mode === "copilot";

	return (
		<div className="bottom-dock">
			<div className="bottom-dock-inner">
				<div className="bottom-dock-stack">
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
							emptyInputMinRows={isCopilot ? 1 : undefined}
							inputMaxRows={isCopilot ? 6 : undefined}
							showWonders={!isCopilot}
						/>
					</div>
				</div>
			</div>
		</div>
	);
};
