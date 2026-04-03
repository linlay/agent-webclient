import React from "react";
import { useAppState } from "../../context/AppContext";
import { ComposerArea } from "../composer/ComposerArea";
import { PlanPanel } from "../plan/PlanPanel";
import { FrontendToolContainer } from "../frontend-tool/FrontendToolContainer";
import { ArtifactPanel } from "../artifact/ArtifactPanel";

export const BottomDock: React.FC = () => {
	const state = useAppState();

	return (
		<div className="bottom-dock">
			<div
				className="bottom-dock-inner"
				style={{ maxWidth: "1000px", margin: "0 auto" }}
			>
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
