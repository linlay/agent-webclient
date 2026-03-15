import React from "react";
import type { CommandModalScope, WorkerRow } from "../../context/types";
import { UiInput } from "../ui/UiInput";
import { UiListItem } from "../ui/UiListItem";
import { UiTag } from "../ui/UiTag";

export const SWITCH_SCOPES = [
	{ key: "all", label: "全部" },
	{ key: "agent", label: "员工" },
	{ key: "team", label: "小组" },
] as const;

export const SwitchModal: React.FC<{
	scope: CommandModalScope;
	searchText: string;
	switchRows: WorkerRow[];
	switchIndex: number;
	searchInputRef: React.RefObject<HTMLInputElement>;
	switchListRef: React.RefObject<HTMLDivElement>;
	switchItemRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
	onSearchChange: (value: string) => void;
	onScopeChange: (scope: CommandModalScope) => void;
	onActivateIndex: (index: number) => void;
	onSelect: (index: number) => void;
}> = ({
	scope,
	searchText,
	switchRows,
	switchIndex,
	searchInputRef,
	switchListRef,
	switchItemRefs,
	onSearchChange,
	onScopeChange,
	onActivateIndex,
	onSelect,
}) => {
	return (
		<div className="command-modal-section">
			<div className="command-switch-toolbar">
				<UiInput
					ref={searchInputRef}
					id="worker-switch-search"
					inputSize="md"
					type="text"
					placeholder="搜索名称 / key / role..."
					value={searchText}
					onChange={(event) => onSearchChange(event.target.value)}
				/>
				<div className="command-scope-group" role="tablist" aria-label="切换范围">
					{SWITCH_SCOPES.map((item) => (
						<button
							key={item.key}
							className={`command-scope-btn ${scope === item.key ? "is-active" : ""}`}
							type="button"
							role="tab"
							aria-selected={scope === item.key}
							onClick={() => onScopeChange(item.key)}
						>
							{item.label}
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
					role="listbox"
					aria-label="切换员工"
				>
					{switchRows.map((row, index) => (
						<UiListItem
							key={row.key}
							ref={(element) => {
								switchItemRefs.current[index] = element;
							}}
							className={`command-list-item ${index === switchIndex ? "is-active" : ""}`}
							selected={index === switchIndex}
							role="option"
							aria-selected={index === switchIndex}
							onMouseEnter={() => onActivateIndex(index)}
							onClick={() => onSelect(index)}
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
	);
};
