import React, { useMemo } from "react";
import { useAppState } from "@/app/state/AppContext";
import { TopNav } from "@/app/layout/TopNav";
import { BottomDock } from "@/app/layout/BottomDock";
import { LeftSidebar } from "@/app/layout/LeftSidebar";
import { RightSidebar } from "@/app/layout/sidebar/right/RightSidebar";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";
import { ShellOverlays } from "@/app/layout/ShellOverlays";
import { SettingsOverlayProvider } from "@/features/settings/components/SettingsOverlayProvider";
import { CommandOverlayProvider } from "@/features/workers/components/CommandOverlayProvider";
import { buildTimelineDisplayItems } from "@/features/timeline/lib/timelineDisplay";
import { useAppRuntimes } from "@/app/layout/hooks/useAppRuntimes";
import {
  TerminalDock,
  resolveTerminalDockWorkspaceKey,
} from "./TerminalDock";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";

export const AppShell: React.FC = () => {
	const state = useAppState();

	/* Initialize business logic hooks */
	useAppRuntimes();

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
		<SettingsOverlayProvider>
			<CommandOverlayProvider>
				<div
					className={`app-shell layout-desktop-fixed ${leftDrawerClass} ${desktopRightSidebarVisible ? "desktop-debug-enabled" : "desktop-debug-disabled"} ${state.terminalDockOpen ? "terminal-dock-open" : ""} ${isTimelineEmpty ? "timeline-empty-layout" : ""}`.trim()}
					id="app"
				>
					<TopNav />
					<LeftSidebar />
					<ConversationStage />
					<RightSidebar />
					<BottomDock />
					{state.terminalDockOpen && currentWorker?.type === "agent" ? (
						<TerminalDock
							agentKey={currentWorker.sourceId}
							workspaceKey={resolveTerminalDockWorkspaceKey(currentWorker)}
							worker={currentWorker}
						/>
					) : null}
					<ShellOverlays />
				</div>
			</CommandOverlayProvider>
		</SettingsOverlayProvider>
	);
};
