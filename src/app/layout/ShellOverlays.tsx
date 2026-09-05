import React from "react";
import { CommandStatusOverlay } from "@/app/layout/CommandStatusOverlay";
import { EventPopover } from "@/features/debug/components/EventPopover";
import { DisplayOverlay } from "@/features/display/components/DisplayOverlay";
import { SettingsOverlayHost } from "@/features/settings/components/SettingsOverlayHost";
import { CommandOverlayHost } from "@/features/command-center/components/CommandOverlayHost";
import { GlobalSearchOverlay } from "@/features/search/components/GlobalSearchOverlay";

export const ShellOverlays: React.FC<{
	commandOverlayVariant?: "copilot";
	settingsOverlayVariant?: "copilot";
}> = ({ commandOverlayVariant, settingsOverlayVariant }) => {
	return (
		<>
			<CommandStatusOverlay />
			<SettingsOverlayHost variant={settingsOverlayVariant} />
			<CommandOverlayHost variant={commandOverlayVariant} />
			{commandOverlayVariant !== "copilot" && <GlobalSearchOverlay />}
			<EventPopover />
			<DisplayOverlay />
		</>
	);
};
