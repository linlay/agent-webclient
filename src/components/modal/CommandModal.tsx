import React, { useEffect, useMemo, useRef } from "react";
import { useAppDispatch, useAppState } from "../../context/AppContext";
import { formatChatTimeLabel } from "../../lib/chatListFormatter";
import {
	buildCurrentWorkerDetailView,
	buildScheduleDraft,
	buildWorkerSwitchRows,
	resolveCurrentWorkerSummary,
} from "../../lib/currentWorker";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { UiListItem } from "../ui/UiListItem";
import { UiTag } from "../ui/UiTag";

const SWITCH_SCOPES = [
	{ key: "all", label: "全部" },
	{ key: "agent", label: "员工" },
	{ key: "team", label: "小组" },
] as const;

function clampIndex(index: number, length: number): number {
	if (length <= 0) return 0;
	return Math.max(0, Math.min(index, length - 1));
}

export const CommandModal: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const searchInputRef = useRef<HTMLInputElement>(null);
	const scheduleTaskRef = useRef<HTMLInputElement>(null);
	const switchListRef = useRef<HTMLDivElement>(null);
	const historyListRef = useRef<HTMLDivElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const cardRef = useRef<HTMLDivElement>(null);
	const switchItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
	const historyItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const modal = state.commandModal;
	const currentWorker = useMemo(() => resolveCurrentWorkerSummary(state), [state]);
	const detailView = useMemo(
		() => (currentWorker ? buildCurrentWorkerDetailView(currentWorker) : null),
		[currentWorker],
	);
	const switchRows = useMemo(
		() => buildWorkerSwitchRows(state.workerRows, modal.scope, modal.searchText),
		[modal.scope, modal.searchText, state.workerRows],
	);
	const historyRows = currentWorker?.relatedChats || [];
	const switchIndex = clampIndex(modal.activeIndex, switchRows.length);
	const historyIndex = clampIndex(modal.activeIndex, historyRows.length);

	const closeModal = (restoreComposerFocus = true) => {
		dispatch({ type: "CLOSE_COMMAND_MODAL" });
		if (restoreComposerFocus) {
			window.dispatchEvent(new CustomEvent("agent:focus-composer"));
		}
	};

	const selectHistory = (index: number) => {
		const target = historyRows[index];
		if (!target) return;
		closeModal(false);
		window.dispatchEvent(
			new CustomEvent("agent:load-chat", {
				detail: {
					chatId: target.chatId,
					focusComposerOnComplete: true,
				},
			}),
		);
	};

	const selectWorker = (index: number) => {
		const target = switchRows[index];
		if (!target) return;
		closeModal(false);
		window.dispatchEvent(
			new CustomEvent("agent:select-worker", {
				detail: {
					workerKey: target.key,
					focusComposerOnComplete: true,
				},
			}),
		);
	};

	const confirmSchedule = () => {
		if (!currentWorker) return;
		const task = String(modal.scheduleTask || "").trim();
		const rule = String(modal.scheduleRule || "").trim();
		if (!task || !rule) return;
		const draft = buildScheduleDraft(currentWorker, task, rule);
		closeModal(false);
		window.dispatchEvent(
			new CustomEvent("agent:set-composer-draft", {
				detail: { draft },
			}),
		);
	};

	useEffect(() => {
		if (!modal.open) return;
		if (modal.type === "switch") {
			if (modal.focusArea === "list") {
				switchListRef.current?.focus();
			} else {
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
			}
			return;
		}
		if (modal.type === "schedule") {
			scheduleTaskRef.current?.focus();
			scheduleTaskRef.current?.select();
			return;
		}
		if (modal.type === "detail") {
			closeButtonRef.current?.focus();
			return;
		}
		cardRef.current?.focus();
	}, [modal.focusArea, modal.open, modal.type]);

	useEffect(() => {
		if (!modal.open || modal.type !== "history") return;
		const activeItem = historyItemRefs.current[historyIndex];
		activeItem?.scrollIntoView({ block: "nearest" });
	}, [historyIndex, modal.open, modal.type]);

	useEffect(() => {
		if (!modal.open || modal.type !== "switch") return;
		const activeItem = switchItemRefs.current[switchIndex];
		activeItem?.scrollIntoView({ block: "nearest" });
	}, [modal.open, modal.type, switchIndex]);

	if (!modal.open || !modal.type) {
		return null;
	}

	return (
		<div
			className="modal"
			id="command-modal"
			onClick={(event) => {
				if (event.target === event.currentTarget) closeModal();
			}}
		>
			<div
				ref={cardRef}
				className="modal-card command-modal-card"
				tabIndex={-1}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						closeModal();
						return;
					}

					if (modal.type === "history") {
						if (event.key === "ArrowDown" && historyRows.length > 0) {
							event.preventDefault();
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { activeIndex: clampIndex(modal.activeIndex + 1, historyRows.length) },
							});
							return;
						}
						if (event.key === "ArrowUp" && historyRows.length > 0) {
							event.preventDefault();
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { activeIndex: clampIndex(modal.activeIndex - 1, historyRows.length) },
							});
							return;
						}
						if (event.key === "Enter" && historyRows.length > 0) {
							event.preventDefault();
							selectHistory(historyIndex);
						}
						return;
					}

					if (modal.type === "switch") {
						if (event.key === "Tab") {
							event.preventDefault();
							const nextFocusArea = event.shiftKey ? "search" : "list";
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { focusArea: nextFocusArea },
							});
							if (nextFocusArea === "search") {
								window.requestAnimationFrame(() => {
									searchInputRef.current?.focus();
									searchInputRef.current?.select();
								});
							} else {
								window.requestAnimationFrame(() => {
									switchListRef.current?.focus();
								});
							}
							return;
						}
						if (event.key === "ArrowRight") {
							event.preventDefault();
							const currentScopeIndex = SWITCH_SCOPES.findIndex((item) => item.key === modal.scope);
							const nextScope = SWITCH_SCOPES[(currentScopeIndex + 1) % SWITCH_SCOPES.length]?.key || "all";
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { scope: nextScope, activeIndex: 0 },
							});
							return;
						}
						if (event.key === "ArrowLeft") {
							event.preventDefault();
							const currentScopeIndex = SWITCH_SCOPES.findIndex((item) => item.key === modal.scope);
							const nextScope =
								SWITCH_SCOPES[(currentScopeIndex - 1 + SWITCH_SCOPES.length) % SWITCH_SCOPES.length]?.key || "all";
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { scope: nextScope, activeIndex: 0 },
							});
							return;
						}
						if (event.key === "ArrowDown" && switchRows.length > 0) {
							event.preventDefault();
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: {
									activeIndex: clampIndex(modal.activeIndex + 1, switchRows.length),
									focusArea: "list",
								},
							});
							return;
						}
						if (event.key === "ArrowUp" && switchRows.length > 0) {
							event.preventDefault();
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: {
									activeIndex: clampIndex(modal.activeIndex - 1, switchRows.length),
									focusArea: "list",
								},
							});
							return;
						}
						if (event.key === "Enter" && switchRows.length > 0) {
							event.preventDefault();
							selectWorker(switchIndex);
						}
						return;
					}

					if (
						modal.type === "schedule"
						&& event.key === "Enter"
						&& (event.metaKey || event.ctrlKey)
					) {
						event.preventDefault();
						confirmSchedule();
					}
				}}
			>
				<div className="command-modal-head">
					<div>
						<h3>
							{modal.type === "history" && "历史对话"}
							{modal.type === "switch" && "切换员工"}
							{modal.type === "detail" && "当前详情"}
							{modal.type === "schedule" && "计划任务"}
						</h3>
						<p className="command-modal-subtitle">
							{currentWorker
								? `${currentWorker.type === "team" ? "小组" : "员工"} · ${currentWorker.displayName}`
								: "当前未选中员工"}
						</p>
					</div>
					<UiButton
						ref={closeButtonRef}
						variant="ghost"
						size="sm"
						onClick={() => closeModal()}
					>
						关闭
					</UiButton>
				</div>

				{modal.type === "history" && (
					<div className="command-modal-section">
						{historyRows.length === 0 ? (
							<div className="command-empty-state">
								当前对象暂无历史对话。
							</div>
						) : (
							<div ref={historyListRef} className="command-modal-list">
								{historyRows.map((chat, index) => (
									<UiListItem
										key={chat.chatId}
										ref={(element) => {
											historyItemRefs.current[index] = element;
										}}
										className={`command-list-item ${index === historyIndex ? "is-active" : ""}`}
										selected={index === historyIndex}
										onMouseEnter={() =>
											dispatch({
												type: "PATCH_COMMAND_MODAL",
												modal: { activeIndex: index },
											})
										}
										onClick={() => selectHistory(index)}
									>
										<div className="command-list-head">
											<strong>{chat.chatName || chat.chatId}</strong>
											<span>{formatChatTimeLabel(chat.updatedAt)}</span>
										</div>
										<div className="command-list-preview">
											{chat.lastRunContent || "(无预览)"}
										</div>
									</UiListItem>
								))}
							</div>
						)}
					</div>
				)}

				{modal.type === "switch" && (
					<div className="command-modal-section">
						<div className="command-switch-toolbar">
							<UiInput
								ref={searchInputRef}
								id="worker-switch-search"
								inputSize="md"
								type="text"
								placeholder="搜索名称 / key / role..."
								value={modal.searchText}
								onChange={(event) =>
									dispatch({
										type: "PATCH_COMMAND_MODAL",
										modal: {
											searchText: event.target.value,
											activeIndex: 0,
											focusArea: "search",
										},
									})
								}
								onKeyDown={(event) => {
									if (event.key === "Tab" && !event.shiftKey) {
										event.preventDefault();
										dispatch({
											type: "PATCH_COMMAND_MODAL",
											modal: { focusArea: "list" },
										});
										window.requestAnimationFrame(() => {
											switchListRef.current?.focus();
										});
									}
								}}
							/>
							<div className="command-scope-group" role="tablist" aria-label="切换范围">
								{SWITCH_SCOPES.map((scope) => (
									<button
										key={scope.key}
										className={`command-scope-btn ${modal.scope === scope.key ? "is-active" : ""}`}
										type="button"
										role="tab"
										aria-selected={modal.scope === scope.key}
										onClick={() =>
											dispatch({
												type: "PATCH_COMMAND_MODAL",
												modal: { scope: scope.key, activeIndex: 0 },
											})
										}
									>
										{scope.label}
									</button>
								))}
							</div>
						</div>

						{switchRows.length === 0 ? (
							<div className="command-empty-state">没有匹配到员工或小组。</div>
						) : (
							<div
								ref={switchListRef}
								className="command-modal-list command-modal-list-focusable"
								tabIndex={0}
							>
								{switchRows.map((row, index) => (
									<UiListItem
										key={row.key}
										ref={(element) => {
											switchItemRefs.current[index] = element;
										}}
										className={`command-list-item ${index === switchIndex ? "is-active" : ""}`}
										selected={index === switchIndex}
										onMouseEnter={() =>
											dispatch({
												type: "PATCH_COMMAND_MODAL",
												modal: { activeIndex: index },
											})
										}
										onClick={() => selectWorker(index)}
									>
										<div className="command-list-head">
											<strong>{row.displayName}</strong>
											<UiTag tone={row.type === "team" ? "default" : "accent"}>
												{row.type === "team" ? "小组" : "员工"}
											</UiTag>
										</div>
										<div className="command-list-meta">
											<span>{row.sourceId}</span>
											<span>{row.role || "--"}</span>
										</div>
										<div className="command-list-preview">
											{row.latestRunContent || (row.hasHistory ? row.latestChatName : "暂无历史对话")}
										</div>
									</UiListItem>
								))}
							</div>
						)}
					</div>
				)}

				{modal.type === "detail" && detailView && (
					<div className="command-modal-section command-detail-grid">
						<div className="command-detail-card">
							<span className="command-detail-label">名称</span>
							<strong>{detailView.title}</strong>
						</div>
						<div className="command-detail-card">
							<span className="command-detail-label">{detailView.identifierLabel}</span>
							<strong>{detailView.identifierValue}</strong>
						</div>
						<div className="command-detail-card">
							<span className="command-detail-label">角色</span>
							<strong>{detailView.role}</strong>
						</div>
						<div className="command-detail-card">
							<span className="command-detail-label">模型</span>
							<strong>{detailView.model}</strong>
						</div>

						<div className="command-detail-block">
							<h4>技能</h4>
							<div className="command-tag-list">
								{detailView.skills.length > 0 ? detailView.skills.map((item) => (
									<UiTag key={item} tone="accent">{item}</UiTag>
								)) : <span className="command-empty-inline">未提供</span>}
							</div>
						</div>

						<div className="command-detail-block">
							<h4>工具</h4>
							<div className="command-tag-list">
								{detailView.tools.length > 0 ? detailView.tools.map((item) => (
									<UiTag key={item} tone="default">{item}</UiTag>
								)) : <span className="command-empty-inline">未提供</span>}
							</div>
						</div>

						{detailView.kindLabel === "小组" && (
							<div className="command-detail-block">
								<h4>成员</h4>
								<div className="command-tag-list">
									{detailView.members.length > 0 ? detailView.members.map((item) => (
										<UiTag key={item} tone="muted">{item}</UiTag>
									)) : <span className="command-empty-inline">未提供</span>}
								</div>
							</div>
						)}

						<div className="command-detail-block command-raw-block">
							<h4>Raw Metadata</h4>
							<pre>{detailView.rawJson}</pre>
						</div>
					</div>
				)}

				{modal.type === "schedule" && (
					<div className="command-modal-section command-schedule-form">
						<div className="field-group">
							<label htmlFor="schedule-task-input">任务内容</label>
							<UiInput
								ref={scheduleTaskRef}
								id="schedule-task-input"
								inputSize="md"
								type="text"
								placeholder="例如：每天整理客户日报"
								value={modal.scheduleTask}
								onChange={(event) =>
									dispatch({
										type: "PATCH_COMMAND_MODAL",
										modal: { scheduleTask: event.target.value },
									})
								}
							/>
						</div>
						<div className="field-group">
							<label htmlFor="schedule-rule-input">执行时间 / 规则</label>
							<UiInput
								id="schedule-rule-input"
								inputSize="md"
								type="text"
								placeholder="例如：每个工作日 18:00"
								value={modal.scheduleRule}
								onChange={(event) =>
									dispatch({
										type: "PATCH_COMMAND_MODAL",
										modal: { scheduleRule: event.target.value },
									})
								}
							/>
							<p className="settings-hint">
								确认后会生成带当前员工上下文的草稿，按需再发送。支持 `Ctrl/Cmd + Enter` 快速确认。
							</p>
						</div>
						<div className="command-schedule-actions">
							<UiButton
								variant="primary"
								size="sm"
								disabled={!String(modal.scheduleTask || "").trim() || !String(modal.scheduleRule || "").trim()}
								onClick={confirmSchedule}
							>
								<MaterialIcon name="schedule" />
								<span>生成草稿</span>
							</UiButton>
							<UiButton variant="ghost" size="sm" onClick={() => closeModal()}>
								取消
							</UiButton>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
