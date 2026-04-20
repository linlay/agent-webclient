import React, { useRef, useEffect, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import {
	DESKTOP_FIXED_BREAKPOINT,
	MOBILE_BREAKPOINT,
} from "@/app/state/constants";
import type { LayoutMode } from "@/app/state/constants";
import { CommandStatusOverlay } from "@/app/layout/CommandStatusOverlay";
import { TopNav } from "@/app/layout/TopNav";
import { BottomDock } from "@/app/layout/BottomDock";
import { LeftSidebar } from "@/app/layout/LeftSidebar";
import { RightSidebar } from "@/app/layout/RightSidebar";
import { DrawerOverlay } from "@/app/layout/DrawerOverlay";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
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

function inferLayoutMode(width: number): LayoutMode {
	if (width >= DESKTOP_FIXED_BREAKPOINT) return "desktop-fixed";
	if (width >= MOBILE_BREAKPOINT) return "tablet-mixed";
	return "mobile-drawer";
}

export const AppShell: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const appRef = useRef<HTMLDivElement>(null);

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

	const layoutClass =
		state.layoutMode === "desktop-fixed"
			? "layout-desktop-fixed"
			: state.layoutMode === "tablet-mixed"
				? "layout-tablet-mixed"
				: "";
	const leftDrawerClass = state.leftDrawerOpen
		? "left-drawer-open"
		: "left-drawer-closed";

	/* Responsive layout detection */
	useEffect(() => {
		const handleResize = () => {
			const mode = inferLayoutMode(window.innerWidth);
			if (mode !== state.layoutMode) {
				dispatch({ type: "SET_LAYOUT_MODE", mode });
			}
		};
		handleResize();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [dispatch, state.layoutMode]);

	const showOverlay =
		(state.leftDrawerOpen || state.rightDrawerOpen) &&
		state.layoutMode === "mobile-drawer";
	const desktopRightSidebarVisible =
		state.desktopDebugSidebarEnabled || Boolean(state.attachmentPreview);
	const timelineEntries = useMemo(() => {
		return state.timelineOrder
			.map((id) => state.timelineNodes.get(id))
			.filter((node): node is NonNullable<typeof node> => Boolean(node));
	}, [state.timelineOrder, state.timelineNodes]);
	const isTimelineEmpty = useMemo(() => {
		return (
			buildTimelineDisplayItems(timelineEntries, state.events).length === 0
		);
	}, [timelineEntries, state.events]);

	return (
		<div
			ref={appRef}
			className={`app-shell ${layoutClass} ${leftDrawerClass} ${desktopRightSidebarVisible ? "desktop-debug-enabled" : "desktop-debug-disabled"} ${state.terminalDockOpen ? "terminal-dock-open" : ""} ${isTimelineEmpty ? "timeline-empty-layout" : ""}`.trim()}
			id="app"
		>
			<TopNav />
			<LeftSidebar />
			<ConversationStage />
			<RightSidebar />
			<BottomDock />
			{state.terminalDockOpen ? <TerminalDock /> : null}
			<CommandStatusOverlay />
			{showOverlay && <DrawerOverlay />}
			{state.settingsOpen && <SettingsModal />}
			<CommandModal />
			<ActionModal />
			<EventPopover />
			<FireworksCanvas />
		</div>
	);
};
