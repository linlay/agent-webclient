import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { CommandStatusOverlay } from "@/app/layout/CommandStatusOverlay";
import { CommandModal } from "@/app/modals/CommandModal";
import { EventPopover } from "@/app/modals/EventPopover";
import { FireworksCanvas } from "@/app/effects/FireworksCanvas";
import { ArchiveModal } from "@/features/settings/components/ArchiveModal";
import { MemoryInfoModal } from "@/features/settings/components/MemoryInfoModal";
import { SettingsModal } from "@/features/settings/components/SettingsModal";

export const ShellOverlays: React.FC<{
	commandModalVariant?: "copilot";
}> = ({ commandModalVariant }) => {
	const state = useAppState();

	return (
		<>
			<CommandStatusOverlay />
			{state.archiveOpen ? <ArchiveModal /> : null}
			{state.memoryInfoOpen ? <MemoryInfoModal /> : null}
			{state.settingsOpen && <SettingsModal />}
			<CommandModal variant={commandModalVariant} />
			<EventPopover />
			<FireworksCanvas />
		</>
	);
};
