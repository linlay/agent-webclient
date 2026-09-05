import React from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import type { Team, WorkerRow } from "@/features/workers/lib/workerState";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import { useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { UiInput } from "@/shared/ui/UiInput";
import { UiListItem } from "@/shared/ui/UiListItem";
import { UiTag } from "@/shared/ui/UiTag";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/icons/material";

export const SWITCH_SCOPES = [
  { key: "all", labelKey: "switch.scope.all" },
  { key: "agent", labelKey: "switch.workerType.agent" },
  { key: "team", labelKey: "switch.workerType.team" },
] as const;

export type WorkerSwitchScope = "all" | "agent" | "team";

type WorkerIcon = Agent["icon"] | Team["icon"];

export const SwitchModal: React.FC<{
  scope: WorkerSwitchScope;
  searchText: string;
  switchRows: WorkerRow[];
  switchIndex: number;
  variant?: "default" | "copilot";
  workerIconsByKey?: Map<string, WorkerIcon>;
  searchInputRef: React.RefObject<HTMLInputElement>;
  switchListRef: React.RefObject<HTMLDivElement>;
  switchItemRefs: React.MutableRefObject<Array<HTMLElement | null>>;
  onSearchChange: (value: string) => void;
  onScopeChange: (scope: WorkerSwitchScope) => void;
  onActivateIndex: (index: number) => void;
  onSelect: (index: number) => void;
  onClose?: () => void;
}> = ({
  scope,
  searchText,
  switchRows,
  switchIndex,
  variant = "default",
  workerIconsByKey,
  searchInputRef,
  switchListRef,
  switchItemRefs,
  onSearchChange,
  onScopeChange,
  onActivateIndex,
  onSelect,
  onClose,
}) => {
  const { t } = useI18n();
  const state = useAppState();
  const currentWorker = resolveCurrentWorkerSummary(state);
  const isCopilot = variant === "copilot";

  return (
    <div
      className={`command-modal-section ${isCopilot ? "command-switch-compact" : ""}`}
    >
      <div className="command-modal-title">
        <UiButton
          className="ui-icon-hover-24"
          size="sm"
          variant="ghost"
          iconOnly
          aria-label={t("modalTitleBar.collapse")}
          onClick={onClose}
        >
          <MaterialIcon name="keyboard_arrow_right" />
        </UiButton>
        <span>{t("commandModal.switch.title")}</span>
        {currentWorker ? (
          <span className="command-modal-subtitle">
            {currentWorker.type === "team"
              ? t("worker.kindLabel.team")
              : t("worker.kindLabel.agent")}{" "}
            · {currentWorker.displayName}
          </span>
        ) : null}
      </div>
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
        <div
          className="command-scope-group"
          role="tablist"
          aria-label={t("switch.scopeLabel")}
        >
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
              {isCopilot ? (
                <div className="command-switch-compact-row">
                  <AgentIcon
                    icon={workerIconsByKey?.get(row.key)}
                    type={row.type}
                    props={{
                      icon: {
                        className: "command-switch-worker-icon",
                        width: 28,
                        height: 28,
                      },
                      avatar: {
                        className: "command-switch-worker-icon",
                        size: 28,
                      },
                    }}
                  />
                  <div className="command-switch-compact-main">
                    <div className="command-list-head">
                      <strong>{row.displayName}</strong>
                      <UiTag tone={row.type === "team" ? "default" : "accent"}>
                        {row.type === "team"
                          ? t("switch.workerType.team")
                          : t("switch.workerType.agent")}
                      </UiTag>
                    </div>
                    <div className="command-list-meta">
                      <span>{row.role || "--"}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="command-list-head">
                    <strong>{row.displayName}</strong>
                    <UiTag tone={row.type === "team" ? "default" : "accent"}>
                      {row.type === "team"
                        ? t("switch.workerType.team")
                        : t("switch.workerType.agent")}
                    </UiTag>
                  </div>
                  <div className="command-list-meta">
                    <span>{row.sourceId}</span>
                    <span>{row.role || "--"}</span>
                  </div>
                  <div className="command-list-preview">
                    {row.latestRunContent ||
                      (row.hasHistory
                        ? row.latestChatName
                        : t("switch.preview.noHistory"))}
                  </div>
                </>
              )}
            </UiListItem>
          ))}
        </div>
      )}
    </div>
  );
};
