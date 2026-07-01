import React from "react";
import type { GlobalCommandSection, GlobalRow } from "@/features/workers/lib/globalCommandRows";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

const SECTION_ORDER: GlobalCommandSection[] = [
  "awaiting",
  "unread",
  "actions",
  "workers",
  "history",
];

function getAwaitingStatusKey(mode?: string): string {
  switch (mode) {
    case "plan":
      return "leftSidebar.awaitingStatus.plan";
    case "question":
      return "leftSidebar.awaitingStatus.question";
    case "approval":
      return "leftSidebar.awaitingStatus.approval";
    case "form":
      return "leftSidebar.awaitingStatus.form";
    default:
      return "leftSidebar.awaitingApproval";
  }
}

function sectionTitleKey(section: GlobalCommandSection): string {
  return `commandModal.global.section.${section}`;
}

function rowClassName(row: GlobalRow, isActive: boolean): string {
  const attention =
    row.kind === "history" &&
    (row.section === "awaiting" || row.section === "unread");
  return [
    "global-command-row",
    `global-command-${row.kind}`,
    `global-command-section-${row.section}`,
    attention ? "global-command-attention" : "",
    isActive ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export const GlobalCommandPanel: React.FC<{
  rows: GlobalRow[];
  activeIndex: number;
  searchText: string;
  searchInputRef: React.RefObject<HTMLInputElement>;
  placeholder: string;
  emptyText: string;
  t: (key: string, params?: Record<string, unknown>) => string;
  onSearchChange: (value: string) => void;
  onActivateIndex: (index: number) => void;
  onSelect: (row: GlobalRow) => void;
}> = ({
  rows,
  activeIndex,
  searchText,
  searchInputRef,
  placeholder,
  emptyText,
  t,
  onSearchChange,
  onActivateIndex,
  onSelect,
}) => {
  return (
    <div className="global-command-panel">
      <div className="global-command-search">
        <input
          ref={searchInputRef}
          className="global-command-input"
          type="text"
          placeholder={placeholder}
          value={searchText}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label={placeholder}
        />
      </div>
      {rows.length === 0 ? (
        <div className="global-command-empty">{emptyText}</div>
      ) : (
        <div className="global-command-list">
          {SECTION_ORDER.map((section) => {
            const sectionRows = rows
              .map((row, rowIndex) => ({ row, rowIndex }))
              .filter((item) => item.row.section === section);
            if (sectionRows.length === 0) return null;

            return (
              <section
                key={section}
                className="global-command-section"
                data-section={section}
              >
                <div className="global-command-section-title">
                  {t(sectionTitleKey(section))}
                </div>
                {sectionRows.map(({ row, rowIndex }) => {
                  const isActive = rowIndex === activeIndex;
                  if (row.kind === "action") {
                    return (
                      <button
                        key={row.key}
                        type="button"
                        className={rowClassName(row, isActive)}
                        onClick={() => onSelect(row)}
                        onMouseEnter={() => onActivateIndex(rowIndex)}
                      >
                        <span className="global-command-icon" aria-hidden="true">
                          <MaterialIcon name={row.icon} />
                        </span>
                        <span className="global-command-label">{row.label}</span>
                      </button>
                    );
                  }

                  if (row.kind === "worker") {
                    return (
                      <button
                        key={row.key}
                        type="button"
                        className={rowClassName(row, isActive)}
                        onClick={() => onSelect(row)}
                        onMouseEnter={() => onActivateIndex(rowIndex)}
                      >
                        <span className="global-command-icon" aria-hidden="true">
                          <AgentIcon icon={row.icon} type={row.type} />
                        </span>
                        <span className="global-command-label">{row.label}</span>
                        <span className="global-command-role">{row.role}</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={row.key}
                      type="button"
                      className={rowClassName(row, isActive)}
                      onClick={() => onSelect(row)}
                      onMouseEnter={() => onActivateIndex(rowIndex)}
                    >
                      <span className="global-command-icon" aria-hidden="true">
                        {row.section === "awaiting" ? (
                          <MaterialIcon name="schedule" />
                        ) : row.section === "unread" ? (
                          <span className="global-command-unread-dot" />
                        ) : (
                          <MaterialIcon name="history" />
                        )}
                      </span>
                      <span className="global-command-main">
                        <span className="global-command-label">{row.label}</span>
                        {row.snippet ? (
                          <span className="global-command-snippet">
                            {row.snippet}
                          </span>
                        ) : null}
                      </span>
                      <span className="global-command-meta">
                        {row.section === "awaiting" ? (
                          <span className="global-command-status">
                            {t(getAwaitingStatusKey(row.awaitingMode))}
                          </span>
                        ) : null}
                        {row.sourceLabel ? (
                          <span className="global-command-source">
                            {row.sourceLabel}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
