import { useCallback } from "react";
import type { AppAction } from "../context/AppContext";
import type { AppState } from "../context/types";
import { type SlashCommandAvailability, type SlashCommandId, isSlashCommandDisabled } from "../lib/slashCommands";

export function useSlashCommandExecution(input: {
	slashAvailability: SlashCommandAvailability;
	closeMention: () => void;
	latestQueryText: string;
	resetForNewConversation: () => void;
	dispatch: (action: AppAction) => void;
	toggleSpeechInput: () => void;
	interruptCurrentRun: () => Promise<void>;
	setInputValue: (value: string) => void;
	setSlashDismissed: (dismissed: boolean) => void;
	state: Pick<AppState, "desktopDebugSidebarEnabled" | "layoutMode" | "planningMode" | "rightDrawerOpen">;
}) {
	const {
		slashAvailability,
		closeMention,
		latestQueryText,
		resetForNewConversation,
		dispatch,
		toggleSpeechInput,
		interruptCurrentRun,
		setInputValue,
		setSlashDismissed,
		state,
	} = input;

	return useCallback(
		async (commandId: SlashCommandId) => {
			if (isSlashCommandDisabled(commandId, slashAvailability)) {
				return;
			}

			setSlashDismissed(true);
			setInputValue("");
			closeMention();

			switch (commandId) {
				case "schedule":
					dispatch({
						type: "OPEN_COMMAND_MODAL",
						modal: { type: "schedule" },
					});
					return;
				case "detail":
					dispatch({
						type: "OPEN_COMMAND_MODAL",
						modal: { type: "detail" },
					});
					return;
				case "history":
					dispatch({
						type: "OPEN_COMMAND_MODAL",
						modal: { type: "history" },
					});
					return;
				case "switch":
					dispatch({
						type: "OPEN_COMMAND_MODAL",
						modal: { type: "switch" },
					});
					return;
				case "new":
					resetForNewConversation();
					return;
				case "redo":
					window.dispatchEvent(
						new CustomEvent("agent:send-message", {
							detail: { message: latestQueryText },
						}),
					);
					return;
				case "debug":
					if (state.layoutMode === "desktop-fixed") {
						dispatch({
							type: "SET_DESKTOP_DEBUG_SIDEBAR_ENABLED",
							enabled: !state.desktopDebugSidebarEnabled,
						});
					} else {
						dispatch({
							type: "SET_RIGHT_DRAWER_OPEN",
							open: !state.rightDrawerOpen,
						});
					}
					return;
				case "voice":
					toggleSpeechInput();
					return;
				case "settings":
					dispatch({ type: "SET_SETTINGS_OPEN", open: true });
					return;
				case "plan":
					dispatch({
						type: "SET_PLANNING_MODE",
						enabled: !state.planningMode,
					});
					return;
				case "stop":
					await interruptCurrentRun();
			}
		},
		[
			closeMention,
			dispatch,
			interruptCurrentRun,
			latestQueryText,
			resetForNewConversation,
			setInputValue,
			setSlashDismissed,
			slashAvailability,
			state,
			toggleSpeechInput,
		],
	);
}
