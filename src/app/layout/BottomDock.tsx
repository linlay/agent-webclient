import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { ComposerArea } from "@/features/composer/components/ComposerArea";
import { PlanPanel } from "@/features/plan/components/PlanPanel";
import { FrontendToolContainer } from "@/features/tools/components/FrontendToolContainer";
import { ArtifactPanel } from "@/features/artifacts/components/ArtifactPanel";

export const BottomDock: React.FC = () => {
	const state = useAppState();

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
						<ComposerArea />
					</div>
				</div>
			</div>
		</div>
	);
};
