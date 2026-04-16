import React, { useRef, useEffect } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import {
	DESKTOP_FIXED_BREAKPOINT,
	MOBILE_BREAKPOINT,
} from "../../context/constants";
import type { LayoutMode } from "../../context/constants";
import { CommandStatusOverlay } from "./CommandStatusOverlay";
import { TopNav } from "./TopNav";
import { BottomDock } from "./BottomDock";
import { LeftSidebar } from "../sidebar/LeftSidebar";
import { RightSidebar } from "../sidebar/RightSidebar";
import { WorkerChatSidebar } from "../sidebar/WorkerChatSidebar";
import { DrawerOverlay } from "../sidebar/DrawerOverlay";
import { ConversationStage } from "../timeline/ConversationStage";
import { SettingsModal } from "../modal/SettingsModal";
import { ActionModal } from "../modal/ActionModal";
import { EventPopover } from "../modal/EventPopover";
import { CommandModal } from "../modal/CommandModal";
import { FireworksCanvas } from "../effects/FireworksCanvas";
import { useChatActions } from "../../hooks/useChatActions";
import { useMessageActions } from "../../hooks/useMessageActions";
import { useActionRuntime } from "../../hooks/useActionRuntime";
import { useVoiceRuntime } from "../../hooks/useVoiceRuntime";
import { useVoiceChatRuntime } from "../../hooks/useVoiceChatRuntime";
import { useWsTransport } from "../../hooks/useWsTransport";
// import { useLiveEvents } from "../../hooks/useLiveEvents";

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
	// Disabled for now because `/api/live` keeps reconnecting in the background.
	// useLiveEvents();

	const layoutClass =
		state.layoutMode === "desktop-fixed"
			? "layout-desktop-fixed"
			: state.layoutMode === "tablet-mixed"
				? "layout-tablet-mixed"
				: "";

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

	return (
		<div
			ref={appRef}
			className={`app-shell ${layoutClass} ${desktopRightSidebarVisible ? "desktop-debug-enabled" : "desktop-debug-disabled"}`.trim()}
			id="app"
		>
			<TopNav />
			<LeftSidebar />
			<ConversationStage />
			<WorkerChatSidebar />
			<RightSidebar />
			<BottomDock />
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
