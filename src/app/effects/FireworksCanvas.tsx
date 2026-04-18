import React from "react";

/**
 * FireworksCanvas — rendered as a fixed full-screen canvas.
 * Used by createActionRuntime for launch_fireworks action.
 */
export const FireworksCanvas: React.FC = () => {
	return (
		<canvas
			id="fireworks-canvas"
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 999,
				pointerEvents: "none",
				width: "100%",
				height: "100%",
			}}
		/>
	);
};
