import React, { useMemo } from "react";
import { useAppState } from "@/app/state/AppContext";
import { CommandStatusOverlay } from "@/app/layout/CommandStatusOverlay";
import { TopNav } from "@/app/layout/TopNav";
import { BottomDock } from "@/app/layout/BottomDock";
import { LeftSidebar } from "@/app/layout/LeftSidebar";
import { RightSidebar } from "@/app/layout/RightSidebar";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import { MemoryInfoModal } from "@/features/settings/components/MemoryInfoModal";
import { ArchiveModal } from "@/features/settings/components/ArchiveModal";
import { ActionModal } from "@/app/modals/ActionModal";
import { EventPopover } from "@/app/modals/EventPopover";
import { CommandModal } from "@/app/modals/CommandModal";
import { FireworksCanvas } from "@/app/effects/FireworksCanvas";
import { useChatActions } from "@/features/chats/hooks/useChatActions";
import { useMessageActions } from "@/features/composer/hooks/useMessageActions";
import { useActionRuntime } from "@/features/tools/hooks/useActionRuntime";
import { useVoiceRuntime } from "@/features/voice/hooks/useVoiceRuntime";
import { useVoiceChatRuntime } from "@/features/voice/hooks/useVoiceChatRuntime";
import { useWsTransport } from "@/features/transport/hooks/useWsTransport";
import { buildTimelineDisplayItems } from "@/features/timeline/lib/timelineDisplay";
import { TerminalDock } from "./TerminalDock";
// import { useLiveEvents } from "@/hooks/useLiveEvents";

export const AppShell: React.FC = () => {
	const state = useAppState();

	/* Initialize business logic hooks */
	useWsTransport();
	useChatActions();
	useMessageActions();
	useActionRuntime();
	useVoiceRuntime();
	useVoiceChatRuntime();
	// Legacy SSE live sync remains available as a compatibility path only.
	// Default real-time updates now come from `/ws` push frames via useWsTransport().
	// useLiveEvents();

	const leftDrawerClass = state.leftDrawerOpen
		? "left-drawer-open"
		: "left-drawer-closed";
	const desktopRightSidebarVisible =
		state.desktopDebugSidebarEnabled ||
		(state.artifactExpanded && state.artifactManualOverride === true) ||
		Boolean(state.attachmentPreview);
	const timelineEntries = useMemo(() => {
		return state.timelineOrder
			.map((id) => state.timelineNodes.get(id))
			.filter((node): node is NonNullable<typeof node> => Boolean(node));
	}, [state.timelineOrder, state.timelineNodes]);
	const isTimelineEmpty = useMemo(() => {
		return (
			buildTimelineDisplayItems(timelineEntries, state.events, {
				taskItemsById: state.taskItemsById,
				taskGroupsById: state.taskGroupsById,
			}).length === 0
		);
	}, [timelineEntries, state.events, state.taskItemsById, state.taskGroupsById]);

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
			{state.terminalDockOpen ? <TerminalDock /> : null}
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
