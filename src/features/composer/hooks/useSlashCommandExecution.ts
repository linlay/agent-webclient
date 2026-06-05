import { useCallback } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import { type SlashCommandAvailability, type SlashCommandId, isSlashCommandDisabled, isSlashCommandFeatureEnabled } from "@/features/composer/lib/slashCommands";

export function useSlashCommandExecution(input: {
	slashAvailability: SlashCommandAvailability;
	closeMention: () => void;
	latestQueryText: string;
	resetForNewConversation: () => void;
	dispatch: (action: AppAction) => void;
	toggleVoiceMode: () => void;
	submitRememberCommand: () => Promise<void>;
	submitLearnCommand: () => Promise<void>;
	submitCompactCommand: () => Promise<void>;
	setInputValue: (value: string) => void;
	setSlashDismissed: (dismissed: boolean) => void;
	state: Pick<AppState, "rightSidebarOpen" | "planningMode" | "chatId" | "usagePopoverOpen">;
}) {
	const {
		slashAvailability,
		closeMention,
		latestQueryText,
		resetForNewConversation,
		dispatch,
		toggleVoiceMode,
		submitRememberCommand,
		submitLearnCommand,
		submitCompactCommand,
		setInputValue,
		setSlashDismissed,
		state,
	} = input;

	return useCallback(
		async (commandId: SlashCommandId) => {
			if (!isSlashCommandFeatureEnabled(commandId)) {
				return;
			}
			if (isSlashCommandDisabled(commandId, slashAvailability)) {
				return;
			}

			setSlashDismissed(true);
			setInputValue("");
			closeMention();

			switch (commandId) {
				case "remember":
					await submitRememberCommand();
					return;
				case "learn":
					await submitLearnCommand();
					return;
				case "compact":
					await submitCompactCommand();
					return;
				case "automation":
					dispatch({
						type: "OPEN_COMMAND_MODAL",
						modal: { type: "automation" },
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
					dispatch(
						state.rightSidebarOpen
							? { type: "CLOSE_RIGHT_SIDEBAR" }
							: { type: "OPEN_RIGHT_SIDEBAR", tab: "debug" },
					);
					return;
				case "voice":
					toggleVoiceMode();
					return;
				case "settings":
					dispatch({ type: "SET_SETTINGS_OPEN", open: true });
					return;
				case "plan":
					dispatch({
						type: "SET_PLANNING_MODE",
						chatId: state.chatId,
						enabled: !state.planningMode,
						persist: true,
					});
					return;
				case "usage":
					dispatch({
						type: "SET_USAGE_POPOVER_OPEN",
						open: !state.usagePopoverOpen,
					});
					return;
			}
		},
		[
			closeMention,
			dispatch,
			latestQueryText,
			resetForNewConversation,
			setInputValue,
			setSlashDismissed,
			slashAvailability,
			state,
			submitLearnCommand,
			submitCompactCommand,
			submitRememberCommand,
			toggleVoiceMode,
		],
	);
}