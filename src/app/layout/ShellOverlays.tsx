import React from "react";
import { CommandStatusOverlay } from "@/app/layout/CommandStatusOverlay";
import { EventPopover } from "@/app/modals/EventPopover";
import { FireworksCanvas } from "@/app/effects/FireworksCanvas";
import { SettingsOverlayHost } from "@/features/settings/components/SettingsOverlayHost";
import { CommandOverlayHost } from "@/features/workers/components/CommandOverlayHost";

export const ShellOverlays: React.FC<{
	commandOverlayVariant?: "copilot";
	settingsOverlayVariant?: "copilot";
}> = ({ commandOverlayVariant, settingsOverlayVariant }) => {
	return (
		<>
			<CommandStatusOverlay />
			<SettingsOverlayHost variant={settingsOverlayVariant} />
			<CommandOverlayHost variant={commandOverlayVariant} />
			<EventPopover />
			<FireworksCanvas />
		</>
	);
};
