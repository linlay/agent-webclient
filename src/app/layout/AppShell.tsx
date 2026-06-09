import React, { useMemo } from "react";
import { useAppState } from "@/app/state/AppContext";
import { CommandStatusOverlay } from "@/app/layout/CommandStatusOverlay";
import { TopNav } from "@/app/layout/TopNav";
import { BottomDock } from "@/app/layout/BottomDock";
import { LeftSidebar } from "@/app/layout/LeftSidebar";
import { RightSidebar } from "@/app/layout/sidebar/right/RightSidebar";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import { MemoryInfoModal } from "@/features/settings/components/MemoryInfoModal";
import { ArchiveModal } from "@/features/settings/components/ArchiveModal";
import { ActionModal } from "@/app/modals/ActionModal";
import { EventPopover } from "@/app/modals/EventPopover";
import { CommandModal } from "@/app/modals/CommandModal";
import { FireworksCanvas } from "@/app/effects/FireworksCanvas";
import { buildTimelineDisplayItems } from "@/features/timeline/lib/timelineDisplay";
import { useAppRuntimes } from "@/app/layout/hooks/useAppRuntimes";
import {
  TerminalDock,
  resolveTerminalDockWorkspaceKey,
} from "./TerminalDock";
import {
  isCoderAgent,
  resolveCurrentWorkerSummary,
} from "@/features/workers/lib/currentWorker";
// import { useLiveEvents } from "@/hooks/useLiveEvents";

export const AppShell: React.FC = () => {
	const state = useAppState();

	/* Initialize business logic hooks */
	useAppRuntimes();
	// Legacy SSE live sync remains available as a compatibility path only.
	// Default real-time updates now come from `/ws` push frames via useWsTransport().
	// useLiveEvents();

	const currentWorker = useMemo(() => resolveCurrentWorkerSummary(state), [state]);
	const leftDrawerClass = state.leftDrawerOpen
		? "left-drawer-open"
		: "left-drawer-closed";
	const desktopRightSidebarVisible = state.rightSidebarOpen;
	const timelineEntries = useMemo(() => {
		return state.timelineOrder
			.map((id) => state.timelineNodes.get(id))
			.filter((node): node is NonNullable<typeof node> => Boolean(node));
	}, [state.timelineOrder, state.timelineNodes]);
	const isTimelineEmpty = useMemo(() => {
		return buildTimelineDisplayItems(timelineEntries, state.events).length === 0;
	}, [timelineEntries, state.events]);

	return (
		<div
			className={`app-shell layout-desktop-fixed ${leftDrawerClass} ${desktopRightSidebarVisible ? "desktop-debug-enabled" : "desktop-debug-disabled"} ${state.terminalDockOpen ? "terminal-dock-open" : ""} ${isTimelineEmpty ? "timeline-empty-layout" : ""}`.trim()}
			id="app"
		>
			<TopNav />
			<LeftSidebar />
			<ConversationStage />
			<RightSidebar />
			<BottomDock />
			{state.terminalDockOpen && currentWorker && isCoderAgent(currentWorker) ? (
				<TerminalDock
					agentKey={currentWorker.sourceId}
					chatId={state.chatId}
					workspaceKey={resolveTerminalDockWorkspaceKey(currentWorker)}
				/>
			) : null}
			<CommandStatusOverlay />
			{state.archiveOpen ? <ArchiveModal /> : null}
			{state.memoryInfoOpen ? <MemoryInfoModal /> : null}
			{state.settingsOpen && <SettingsModal />}
			<CommandModal />
			<ActionModal />
			<EventPopover />
			<FireworksCanvas />
		</div>
	);
};
