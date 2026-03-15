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
						<div
							className="mode-switch"
							role="tablist"
							aria-label="对话模式"
						>
							<button
								className={`mode-btn ${state.conversationMode === "worker" ? "is-active" : ""}`}
								type="button"
								role="tab"
								aria-selected={state.conversationMode === "worker"}
								onClick={() =>
									window.dispatchEvent(
										new CustomEvent(
											"agent:set-conversation-mode",
											{
												detail: { mode: "worker" },
											},
										),
									)
								}
							>
								员工模式
							</button>
							<button
								className={`mode-btn ${state.conversationMode === "chat" ? "is-active" : ""}`}
								type="button"
								role="tab"
								aria-selected={state.conversationMode === "chat"}
								onClick={() =>
									window.dispatchEvent(
										new CustomEvent(
											"agent:set-conversation-mode",
											{
												detail: { mode: "chat" },
											},
										),
									)
								}
							>
								聊天模式
							</button>
						</div>
					</div>
				</div>

				<div className="nav-group nav-center">
					<div className="current-worker-card" aria-live="polite">
						<strong className="current-worker-name">
							{currentWorker?.displayName || "未选择员工"}
						</strong>
						<span className="current-worker-role">
							{currentWorkerRole}
						</span>
					</div>
				</div>

				<div className="nav-group">
					<span
						className={`status-pill ${statusClass}`}
						id="api-status"
					>
						{statusText}
					</span>
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
