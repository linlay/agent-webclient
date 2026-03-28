import React from "react";
import { useAppState } from "../../context/AppContext";

export const CommandStatusOverlay: React.FC = () => {
	const overlay = useAppState().commandStatusOverlay;

	if (!overlay.visible) {
		return null;
	}

	return (
		<div className="command-status-overlay" aria-live="polite">
			<div
				className={`command-status-card is-${overlay.phase}`}
				data-command-type={overlay.commandType || ""}
				data-phase={overlay.phase}
			>
				<div className="command-status-orb" aria-hidden="true">
					<span />
					<span />
					<span />
				</div>
				<div className="command-status-text">{overlay.text}</div>
			</div>
		</div>
	);
};
