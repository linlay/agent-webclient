import React from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

interface TopNavStatusDisplay {
	statusClass: "is-idle" | "is-running" | "is-error";
	statusModifierClass?: "is-ws-ready";
	statusText: string;
	statusTitle?: string;
}

export function resolveTopNavStatus(
	state: Pick<
		AppState,
		"streaming" | "events" | "wsStatus" | "wsErrorMessage" | "transportMode"
	>,
): TopNavStatusDisplay {
	const wsErrorMessage = String(state.wsErrorMessage || "").trim();
	const hasRunError = state.events.some((event) => event.type === "run.error");

	if (state.streaming) {
		return {
			statusClass: "is-running",
			statusText: "运行中...",
		};
	}

	if (state.transportMode === "sse") {
		if (hasRunError) {
			return {
				statusClass: "is-error",
				statusText: "运行异常",
			};
		}
		return {
			statusClass: "is-idle",
			statusText: "SSE 已启用",
		};
	}

	if (state.wsStatus === "connecting") {
		return {
			statusClass: "is-running",
			statusText: "WebSocket 连接中...",
		};
	}

	if (
		state.wsStatus === "error" ||
		(state.wsStatus === "disconnected" && wsErrorMessage)
	) {
		return {
			statusClass: "is-error",
			statusText: "WebSocket 连接异常",
			statusTitle: wsErrorMessage || "WebSocket 连接异常",
		};
	}

	if (hasRunError) {
		return {
			statusClass: "is-error",
			statusText: "运行异常",
		};
	}

	return {
		statusClass: "is-idle",
		statusModifierClass: "is-ws-ready",
		statusText: "ws已就绪",
	};
}

export const TopNav: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const { statusClass, statusModifierClass, statusText, statusTitle } =
		resolveTopNavStatus(state);
	const currentWorker = resolveCurrentWorkerSummary(state);
	const currentWorkerRole = String(currentWorker?.role || "").trim() || "--";
	const showCompactNewChatButton = state.layoutMode !== "desktop-fixed";
	const voiceModeAvailable = currentWorker?.type === "agent";
	const showMuteControl = voiceModeAvailable || state.audioMuted;
	const isMacPlatform = React.useMemo(
		() =>
			typeof navigator !== "undefined" &&
			/Mac|iPhone|iPad|iPod/.test(navigator.platform),
		[],
	);
	const voiceOpenShortcutLabel = isMacPlatform
		? "⌘⇧Space"
		: "Ctrl+Shift+Space";
	const voiceOpenAriaShortcut = isMacPlatform
		? "Meta+Shift+Space"
		: "Control+Shift+Space";
	const voiceToggleDisabled =
		!voiceModeAvailable ||
		state.streaming ||
		Boolean(state.activeFrontendTool);

	const handleStartNewConversation = () => {
		window.dispatchEvent(
			new CustomEvent("agent:start-new-conversation"),
		);
	};

	const handleToggleVoiceMode = () => {
		if (voiceToggleDisabled) return;
		dispatch({
			type: "SET_INPUT_MODE",
			mode: state.inputMode === "voice" ? "text" : "voice",
		});
	};

	const handleToggleAudioMuted = () => {
		dispatch({
			type: "SET_AUDIO_MUTED",
			muted: !state.audioMuted,
		});
	};

	const handleStartVoiceMode = React.useCallback(() => {
		if (voiceToggleDisabled || state.inputMode === "voice") return;
		dispatch({
			type: "SET_INPUT_MODE",
			mode: "voice",
		});
	}, [dispatch, state.inputMode, voiceToggleDisabled]);

	const handleHangupVoiceMode = React.useCallback(() => {
		if (state.inputMode !== "voice") return;
		dispatch({
			type: "SET_INPUT_MODE",
			mode: "text",
		});
	}, [dispatch, state.inputMode]);

	React.useEffect(() => {
		if (state.settingsOpen || state.commandModal.open) return;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.repeat) return;
			const target = event.target;
			if (target instanceof HTMLElement && target.closest(".modal")) {
				return;
			}

			const isVoiceOpenShortcut =
				event.code === "Space" &&
				event.shiftKey &&
				!event.altKey &&
				(isMacPlatform
					? event.metaKey && !event.ctrlKey
					: event.ctrlKey && !event.metaKey);

			if (isVoiceOpenShortcut) {
				event.preventDefault();
				handleStartVoiceMode();
				return;
			}

			if (event.key !== "Escape") return;
			if (event.altKey || event.ctrlKey || event.metaKey) return;
			event.preventDefault();
			handleHangupVoiceMode();
		};

		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [
		handleStartVoiceMode,
		handleHangupVoiceMode,
		isMacPlatform,
		state.commandModal.open,
		state.settingsOpen,
	]);

	return (
		<nav className="top-nav">
			<div className="top-nav-inner">
				<div className="nav-group">
					<UiButton
						id="open-left-drawer-btn"
						className="icon-btn"
						size="sm"
						iconOnly
						aria-label="打开对话列表"
						onClick={() =>
							dispatch({
								type: "SET_LEFT_DRAWER_OPEN",
								open: !state.leftDrawerOpen,
							})
						}
					>
						<MaterialIcon name="menu" />
					</UiButton>
					<div className="brand-cluster">
						<div className="brand-mark">
							<div className="brand-logo">A</div>
							<div className="brand-text">
								<strong>AGENT 测试文案04-16</strong>
								<span>Webclient</span>
							</div>
						</div>
					</div>
				</div>

				<div className="nav-group nav-center">
					<div className={`current-worker-card`} aria-live="polite">
						<div className="current-worker-meta">
							<strong className="current-worker-name">
								{currentWorker?.displayName || "未选择员工"}
							</strong>
							<span className="current-worker-role">
								{currentWorkerRole}
							</span>
						</div>
					</div>
					{voiceModeAvailable || showMuteControl ? (
								<div className="current-worker-tools">
									{voiceModeAvailable ? (
										<UiButton
											className={`current-worker-tool current-worker-tool-voice ${state.inputMode === "voice" ? "is-hangup" : "is-call"}`}
											variant="secondary"
											size="sm"
											iconOnly
											disabled={voiceToggleDisabled}
											aria-label={
												state.inputMode === "voice"
													? "挂断语聊"
													: "打开语聊"
											}
											aria-keyshortcuts={
												state.inputMode === "voice"
													? "Escape"
													: voiceOpenAriaShortcut
											}
											title={
												state.inputMode === "voice"
													? "挂断语聊 (Esc)"
													: `打开语聊 (${voiceOpenShortcutLabel})`
											}
											onClick={handleToggleVoiceMode}
										>
											<MaterialIcon
												name={
													state.inputMode === "voice"
														? "call_end"
														: "call"
												}
											/>
										</UiButton>
									) : null}
							{showMuteControl ? (
								<UiButton
									className={`current-worker-tool ${state.audioMuted ? "is-muted" : ""}`}
									variant="secondary"
									size="sm"
									iconOnly
									active={state.audioMuted}
									aria-label={
										state.audioMuted
											? "取消静音"
											: "静音语音输出"
									}
									title={
										state.audioMuted
											? "取消静音"
											: "静音语音输出"
									}
									onClick={handleToggleAudioMuted}
								>
									<MaterialIcon
										name={
											state.audioMuted
												? "volume_off"
												: "volume_up"
										}
									/>
								</UiButton>
							) : null}
						</div>
					) : null}
				</div>

				<div className="nav-group">
					<span
						className={`status-pill ${statusClass}${statusModifierClass ? ` ${statusModifierClass}` : ""}`}
						id="api-status"
						title={statusTitle}
					>
						{statusText}
					</span>
					{showCompactNewChatButton ? (
						<UiButton
							id="top-nav-new-chat-btn"
							className="icon-btn top-nav-new-chat-btn"
							size="sm"
							iconOnly
							aria-label="开始新聊天"
							title="开始新聊天"
							onClick={handleStartNewConversation}
						>
							<MaterialIcon name="edit_square" />
						</UiButton>
					) : null}
					<UiButton
						id="open-right-drawer-btn"
						className={`icon-btn ${state.layoutMode === "desktop-fixed" && state.desktopDebugSidebarEnabled ? "is-active" : ""}`}
						size="sm"
						iconOnly
						active={
							state.layoutMode === "desktop-fixed" &&
							state.desktopDebugSidebarEnabled
						}
						aria-label={
							state.layoutMode === "desktop-fixed"
								? state.desktopDebugSidebarEnabled
									? "关闭调试面板"
									: "打开调试面板"
								: "打开调试面板"
						}
						onClick={() => {
							if (state.attachmentPreview) {
								dispatch({ type: "CLOSE_ATTACHMENT_PREVIEW" });
								if (state.layoutMode === "desktop-fixed") {
									dispatch({
										type: "SET_DESKTOP_DEBUG_SIDEBAR_ENABLED",
										enabled: true,
									});
								} else {
									dispatch({
										type: "SET_RIGHT_DRAWER_OPEN",
										open: true,
									});
								}
								return;
							}

							if (state.layoutMode === "desktop-fixed") {
								dispatch({
									type: "SET_DESKTOP_DEBUG_SIDEBAR_ENABLED",
									enabled: !state.desktopDebugSidebarEnabled,
								});
								return;
							}

							dispatch({
								type: "SET_RIGHT_DRAWER_OPEN",
								open: !state.rightDrawerOpen,
							});
							if (state.layoutMode === "mobile-drawer") {
								dispatch({
									type: "SET_LEFT_DRAWER_OPEN",
									open: false,
								});
							}
						}}
					>
						<MaterialIcon name="bug_report" />
					</UiButton>
					<UiButton
						className="icon-btn"
						id="settings-btn"
						size="sm"
						iconOnly
						aria-label="打开设置"
						onClick={() =>
							dispatch({ type: "SET_SETTINGS_OPEN", open: true })
						}
					>
						<MaterialIcon name="settings" />
					</UiButton>
				</div>
			</div>
		</nav>
	);
};
