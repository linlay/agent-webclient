import React, { useEffect, useMemo, useRef } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { buildCurrentWorkerDetailView, buildScheduleDraft, buildWorkerSwitchRows, resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { CommandModalHeader } from "@/app/modals/CommandModalHeader";
import { DetailModal } from "@/app/modals/DetailModal";
import { HistoryModal } from "@/app/modals/HistoryModal";
import { ScheduleModal } from "@/app/modals/ScheduleModal";
import { SWITCH_SCOPES, SwitchModal } from "@/app/modals/SwitchModal";

function clampIndex(index: number, length: number): number {
	if (length <= 0) return 0;
	return Math.max(0, Math.min(index, length - 1));
}

function includesTarget(container: HTMLElement | null, target: EventTarget | null): boolean {
	return Boolean(container && target instanceof Node && container.contains(target));
}

export const CommandModal: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const searchInputRef = useRef<HTMLInputElement>(null);
	const historyInputRef = useRef<HTMLInputElement>(null);
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
	const filteredHistoryRows = useMemo(() => {
		const rows = currentWorker?.relatedChats || [];
		const search = String(modal.historySearch || "").trim().toLowerCase();
		if (!search) return rows;
		return rows.filter((row) => {
			const haystack = [
				row.chatName,
				row.chatId,
				row.lastRunContent,
			].join(" ").toLowerCase();
			return haystack.includes(search);
		});
	}, [currentWorker, modal.historySearch]);
	const switchIndex = clampIndex(modal.activeIndex, switchRows.length);
	const historyIndex = clampIndex(modal.activeIndex, filteredHistoryRows.length);

	const closeModal = (restoreComposerFocus = true) => {
		dispatch({ type: "CLOSE_COMMAND_MODAL" });
		if (restoreComposerFocus) {
			window.dispatchEvent(new CustomEvent("agent:focus-composer"));
		}
	};

	const selectHistory = (index: number) => {
		const target = filteredHistoryRows[index];
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
		if (modal.type === "history") {
			historyInputRef.current?.focus();
			historyInputRef.current?.select();
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
		historyItemRefs.current[historyIndex]?.scrollIntoView({ block: "nearest" });
	}, [historyIndex, modal.open, modal.type]);

	useEffect(() => {
		if (!modal.open || modal.type !== "switch") return;
		switchItemRefs.current[switchIndex]?.scrollIntoView({ block: "nearest" });
	}, [modal.open, modal.type, switchIndex]);

	if (!modal.open || !modal.type) {
		return null;
	}

	const subtitle = currentWorker
		? `${currentWorker.type === "team" ? "小组" : "员工"} · ${currentWorker.displayName}`
		: "当前未选中员工";
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
						const target = event.target;
						if (event.key === "Tab") {
							event.preventDefault();
							if (event.shiftKey) {
								if (target === closeButtonRef.current) {
									historyListRef.current?.focus();
									return;
								}
								if (includesTarget(historyListRef.current, target)) {
									historyInputRef.current?.focus();
									historyInputRef.current?.select();
									return;
								}
								closeButtonRef.current?.focus();
								return;
							}
							if (target === historyInputRef.current) {
								historyListRef.current?.focus();
								return;
							}
							if (includesTarget(historyListRef.current, target)) {
								closeButtonRef.current?.focus();
								return;
							}
							historyInputRef.current?.focus();
							historyInputRef.current?.select();
							return;
						}
						if (event.key === "ArrowDown" && filteredHistoryRows.length > 0) {
							event.preventDefault();
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { activeIndex: clampIndex(modal.activeIndex + 1, filteredHistoryRows.length) },
							});
							if (target === historyInputRef.current || !includesTarget(historyListRef.current, event.target)) {
								window.requestAnimationFrame(() => {
									historyListRef.current?.focus();
								});
							}
							return;
						}
						if (event.key === "ArrowUp" && filteredHistoryRows.length > 0) {
							event.preventDefault();
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { activeIndex: clampIndex(modal.activeIndex - 1, filteredHistoryRows.length) },
							});
							if (event.target === historyInputRef.current || !includesTarget(historyListRef.current, event.target)) {
								window.requestAnimationFrame(() => {
									historyListRef.current?.focus();
								});
							}
							return;
						}
						if (event.key === "Enter" && filteredHistoryRows.length > 0) {
							event.preventDefault();
							selectHistory(historyIndex);
						}
						return;
					}

					if (modal.type === "switch") {
						if (event.key === "Tab") {
							event.preventDefault();
							const nextFocusArea = modal.focusArea === "search" ? "list" : "search";
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { focusArea: nextFocusArea },
							});
							window.requestAnimationFrame(() => {
								if (nextFocusArea === "search") {
									searchInputRef.current?.focus();
									searchInputRef.current?.select();
								} else {
									switchListRef.current?.focus();
								}
							});
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
							window.requestAnimationFrame(() => {
								switchListRef.current?.focus();
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
							window.requestAnimationFrame(() => {
								switchListRef.current?.focus();
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
						return;
					}

				}}
			>
				<CommandModalHeader
					type={modal.type}
					subtitle={subtitle}
					closeButtonRef={closeButtonRef}
					onClose={() => closeModal()}
				/>

				{modal.type === "history" && (
					<HistoryModal
						historyRows={filteredHistoryRows}
						historyIndex={historyIndex}
						historySearch={modal.historySearch}
						historyInputRef={historyInputRef}
						historyListRef={historyListRef}
						historyItemRefs={historyItemRefs}
						onHistorySearchChange={(value) =>
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { historySearch: value, activeIndex: 0 },
							})
						}
						onActivateIndex={(index) =>
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { activeIndex: index },
							})
						}
						onSelect={selectHistory}
					/>
				)}

				{modal.type === "switch" && (
					<SwitchModal
						scope={modal.scope}
						searchText={modal.searchText}
						switchRows={switchRows}
						switchIndex={switchIndex}
						searchInputRef={searchInputRef}
						switchListRef={switchListRef}
						switchItemRefs={switchItemRefs}
						onSearchChange={(value) =>
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: {
									searchText: value,
									activeIndex: 0,
									focusArea: "search",
								},
							})
						}
						onScopeChange={(scope) =>
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { scope, activeIndex: 0 },
							})
						}
						onActivateIndex={(index) =>
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { activeIndex: index },
							})
						}
						onSelect={selectWorker}
					/>
				)}

				{modal.type === "detail" && detailView && (
					<DetailModal detailView={detailView} />
				)}

				{modal.type === "schedule" && (
					<ScheduleModal
						scheduleTaskRef={scheduleTaskRef}
						scheduleTask={modal.scheduleTask}
						scheduleRule={modal.scheduleRule}
						onTaskChange={(value) =>
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { scheduleTask: value },
							})
						}
						onRuleChange={(value) =>
							dispatch({
								type: "PATCH_COMMAND_MODAL",
								modal: { scheduleRule: value },
							})
						}
						onConfirm={confirmSchedule}
						onCancel={() => closeModal()}
					/>
				)}
			</div>
		</div>
	);
};
