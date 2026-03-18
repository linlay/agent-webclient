import React from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { resolveCurrentWorkerSummary } from "../../lib/currentWorker";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";

export const TopNav: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();

	const statusClass = state.streaming
		? "is-running"
		: state.events.some((e) => e.type === "error")
			? "is-error"
			: "is-idle";

	const statusText = state.streaming ? "运行中..." : "就绪";
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
		if (state.planAutoCollapseTimer) {
			window.clearTimeout(state.planAutoCollapseTimer);
			dispatch({ type: "SET_PLAN_AUTO_COLLAPSE_TIMER", timer: null });
		}
		state.abortController?.abort();
		window.dispatchEvent(new CustomEvent("agent:voice-reset"));
		dispatch({ type: "SET_CHAT_ID", chatId: "" });
		dispatch({ type: "SET_RUN_ID", runId: "" });
		dispatch({ type: "SET_REQUEST_ID", requestId: "" });
		dispatch({ type: "SET_STREAMING", streaming: false });
		dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
		dispatch({
			type:
				state.conversationMode === "worker"
					? "RESET_ACTIVE_CONVERSATION"
					: "RESET_CONVERSATION",
		});
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
								<strong>AGENT</strong>
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
						className={`status-pill ${statusClass}`}
						id="api-status"
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
