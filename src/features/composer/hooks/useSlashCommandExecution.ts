import { useCallback } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import { type SlashCommandAvailability, type SlashCommandId, isSlashCommandDisabled } from "@/features/composer/lib/slashCommands";
import { createRemoteControlSession } from "@/features/transport/lib/apiClientProxy";

export interface RemoteControlCommandContext {
	agentKey: string;
	chatId: string;
	teamId?: string;
	title?: string;
}

export function useSlashCommandExecution(input: {
	slashAvailability: SlashCommandAvailability;
	closeMention: () => void;
	latestQueryText: string;
	resetForNewConversation: () => void;
	dispatch: (action: AppAction) => void;
	toggleVoiceMode: () => void;
	interruptCurrentRun: () => Promise<void>;
	submitRememberCommand: () => Promise<void>;
	submitLearnCommand: () => Promise<void>;
	remoteControlContext: RemoteControlCommandContext;
	setInputValue: (value: string) => void;
	setSlashDismissed: (dismissed: boolean) => void;
	state: Pick<AppState, "rightSidebarOpen" | "planningMode">;
}) {
	const {
		slashAvailability,
		closeMention,
		latestQueryText,
		resetForNewConversation,
		dispatch,
		toggleVoiceMode,
		interruptCurrentRun,
		submitRememberCommand,
		submitLearnCommand,
		remoteControlContext,
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
				case "remote-control": {
					const agentKey = String(remoteControlContext.agentKey || "").trim();
					const chatId = String(remoteControlContext.chatId || "").trim();
					if (!agentKey || !chatId) {
						const nodeId = `remote_control_error_${Date.now()}`;
						dispatch({
							type: "SET_TIMELINE_NODE",
							id: nodeId,
							node: {
								id: nodeId,
								kind: "message",
								role: "system",
								text: "当前会话缺少 agentKey 或 chatId，无法启动手机远控。",
								ts: Date.now(),
							},
						});
						dispatch({ type: "APPEND_TIMELINE_ORDER", id: nodeId });
						return;
					}
					const pendingNodeId = `remote_control_pending_${Date.now()}`;
					dispatch({
						type: "SET_TIMELINE_NODE",
						id: pendingNodeId,
						node: {
							id: pendingNodeId,
							kind: "message",
							role: "system",
							text: "正在启动手机远控并创建 Cloudflare 公网入口...",
							ts: Date.now(),
						},
					});
					dispatch({ type: "APPEND_TIMELINE_ORDER", id: pendingNodeId });
					try {
						const response = await createRemoteControlSession({
							agentKey,
							chatId,
							teamId: remoteControlContext.teamId || undefined,
							title: remoteControlContext.title || undefined,
						});
						const data = response.data;
						const expiresAt = data.expiresAt
							? new Date(data.expiresAt).toLocaleString()
							: "";
						const qr = data.qrCodeDataUrl
							? `![Remote Control QR](${data.qrCodeDataUrl})\n\n`
							: "";
						const statusLine = data.tunnelStatus === "connected"
							? "Cloudflare Tunnel 已连接"
							: data.tunnelStatus === "disabled"
								? "当前使用本地地址"
								: `Cloudflare Tunnel 未就绪：${data.tunnelError || data.tunnelStatus}`;
						dispatch({
							type: "SET_TIMELINE_NODE",
							id: pendingNodeId,
							node: {
								id: pendingNodeId,
								kind: "content",
								role: "assistant",
								text: [
									"### 手机远控已启动",
									qr + `手机访问：[${data.publicUrl}](${data.publicUrl})`,
									`绑定会话：\`${data.agentKey}\` / \`${data.chatId}\``,
									expiresAt ? `过期时间：${expiresAt}` : "",
									statusLine,
								].filter(Boolean).join("\n\n"),
								ts: Date.now(),
							},
						});
					} catch (error) {
						dispatch({
							type: "SET_TIMELINE_NODE",
							id: pendingNodeId,
							node: {
								id: pendingNodeId,
								kind: "message",
								role: "system",
								text: `手机远控启动失败：${(error as Error).message}`,
								ts: Date.now(),
							},
						});
					}
					return;
				}
				case "remember":
					await submitRememberCommand();
					return;
				case "learn":
					await submitLearnCommand();
					return;
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
			submitLearnCommand,
			submitRememberCommand,
			remoteControlContext,
			toggleVoiceMode,
		],
	);
}
