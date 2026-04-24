import React from "react";
import type { CommandModalScope, WorkerRow } from "@/app/state/types";
import { useI18n } from "@/shared/i18n";
import { UiInput } from "@/shared/ui/UiInput";
import { UiListItem } from "@/shared/ui/UiListItem";
import { UiTag } from "@/shared/ui/UiTag";

export const SWITCH_SCOPES = [
	{ key: "all", labelKey: "switch.scope.all" },
	{ key: "agent", labelKey: "switch.workerType.agent" },
	{ key: "team", labelKey: "switch.workerType.team" },
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
	const { t } = useI18n();

	return (
		<div className="command-modal-section">
			<div className="command-switch-toolbar">
				<UiInput
					ref={searchInputRef}
					id="worker-switch-search"
					inputSize="md"
					type="text"
					placeholder={t("switch.searchPlaceholder")}
					value={searchText}
					onChange={(event) => onSearchChange(event.target.value)}
				/>
				<div className="command-scope-group" role="tablist" aria-label={t("switch.scopeLabel")}>
					{SWITCH_SCOPES.map((item) => (
						<button
							key={item.key}
							className={`command-scope-btn ${scope === item.key ? "is-active" : ""}`}
							type="button"
							role="tab"
							aria-selected={scope === item.key}
							onClick={() => onScopeChange(item.key)}
						>
							{t(item.labelKey)}
						</button>
					))}
				</div>
			</div>

			{switchRows.length === 0 ? (
				<div className="command-empty-state">{t("switch.empty")}</div>
			) : (
				<div
					ref={switchListRef}
					className="command-modal-list command-modal-list-focusable"
					tabIndex={0}
					role="listbox"
					aria-label={t("switch.ariaLabel")}
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
									{row.type === "team" ? t("switch.workerType.team") : t("switch.workerType.agent")}
								</UiTag>
							</div>
							<div className="command-list-meta">
								<span>{row.sourceId}</span>
								<span>{row.role || "--"}</span>
							</div>
							<div className="command-list-preview">
								{row.latestRunContent || (row.hasHistory ? row.latestChatName : t("switch.preview.noHistory"))}
							</div>
						</UiListItem>
					))}
				</div>
			)}
		</div>
	);
};
