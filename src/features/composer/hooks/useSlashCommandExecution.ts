import { useCallback } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import {
	type SlashCommandAvailability,
	type SlashCommandId,
	isSlashCommandDisabled,
	isSlashCommandFeatureEnabled,
} from "@/features/composer/lib/slashCommands";
import { useSettingsOverlayActions } from "@/features/settings/components/SettingsOverlayProvider";
import { useCommandOverlayActions } from "@/features/workers/components/CommandOverlayProvider";
import { useOpenTarget } from "@/features/surfaces/openTarget";

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
	openBTW: () => void;
	state: Pick<
		AppState,
		"rightSidebarOpen" | "planningMode" | "chatId" | "usagePopoverOpen"
		| "runId"
	> &
		Partial<Pick<AppState, "editingMode">>;
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
		openBTW,
		state,
	} = input;
	const { openOverlay } = useSettingsOverlayActions();
	const { openCommandOverlay } = useCommandOverlayActions();
	const openTarget = useOpenTarget();

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
				case "btw":
					openBTW();
					return;
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
					openCommandOverlay({ type: "automation" });
					return;
				case "history":
					openCommandOverlay({ type: "history" });
					return;
				case "new":
					resetForNewConversation();
					return;
				case "debug":
					if (state.chatId) {
						openTarget({
							version: 1,
							kind: "debug",
							chatId: state.chatId,
							toggle: true,
						});
					}
					return;
				case "voice":
					toggleVoiceMode();
					return;
				case "settings":
					openOverlay("settings");
					return;
				case "plan":
					dispatch({
						type: "SET_PLANNING_MODE",
						chatId: state.chatId,
						enabled: !state.planningMode,
						persist: true,
					});
					return;
				case "editing":
					dispatch({
						type: "SET_EDITING_MODE",
						enabled: state.editingMode !== true,
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
			openCommandOverlay,
			openOverlay,
			openBTW,
			openTarget,
		],
	);
}
