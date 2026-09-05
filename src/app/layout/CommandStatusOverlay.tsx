import React from "react";
import { useAppState } from "@/app/state/AppContext";
import styles from "./CommandStatusOverlay.module.css";

export const CommandStatusOverlay: React.FC = () => {
	const overlay = useAppState().commandStatusOverlay;

	if (!overlay.visible) {
		return null;
	}

	return (
		<div className={`command-status-overlay ${styles["command-status-overlay"]}`} aria-live="polite">
			<div
				className={`command-status-card ${styles["command-status-card"]} is-${overlay.phase}`}
				data-command-type={overlay.commandType || ""}
				data-phase={overlay.phase}
			>
				<div className={`command-status-orb ${styles["command-status-orb"]}`} aria-hidden="true">
					<span />
					<span />
					<span />
				</div>
				<div className={`command-status-text ${styles["command-status-text"]}`}>{overlay.text}</div>
			</div>
		</div>
	);
};
