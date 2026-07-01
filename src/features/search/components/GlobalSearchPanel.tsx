import React from "react";
import type { GlobalRow } from "@/features/search/lib/globalSearchRows";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

interface GlobalSearchPanelProps {
  searchText: string;
  searchInputRef: React.RefObject<HTMLInputElement>;
  placeholder: string;
  emptyText: string;
  rows: GlobalRow[];
  activeIndex: number;
  onSearchChange: (value: string) => void;
  onActivateIndex: (index: number) => void;
  onSelectRow: (row: GlobalRow) => void;
}

export const GlobalSearchPanel: React.FC<GlobalSearchPanelProps> = ({
  searchText,
  searchInputRef,
  placeholder,
  emptyText,
  rows,
  activeIndex,
  onSearchChange,
  onActivateIndex,
  onSelectRow,
}) => {
  return (
    <div className="global-search-panel">
      <div className="global-search-box">
        <input
          ref={searchInputRef}
          className="global-search-input"
          type="text"
          placeholder={placeholder}
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={placeholder}
        />
      </div>
      {rows.length === 0 ? (
        <div className="global-search-empty">{emptyText}</div>
      ) : (
        <div className="global-search-list">
          {rows.map((row, index) => {
            const isActive = index === activeIndex;
            if (row.kind === "action") {
              return (
                <button
                  key={row.key}
                  type="button"
                  className={`global-search-row global-search-action${isActive ? " is-active" : ""}`}
                  onClick={() => onSelectRow(row)}
                  onMouseEnter={() => onActivateIndex(index)}
                >
                  <span className="global-search-icon" aria-hidden="true">
                    <MaterialIcon name={row.icon} />
                  </span>
                  <span className="global-search-label">{row.label}</span>
                </button>
              );
            }
            if (row.kind === "worker") {
              return (
                <button
                  key={row.key}
                  type="button"
                  className={`global-search-row global-search-worker${isActive ? " is-active" : ""}`}
                  onClick={() => onSelectRow(row)}
                  onMouseEnter={() => onActivateIndex(index)}
                >
                  <span className="global-search-icon" aria-hidden="true">
                    <AgentIcon icon={row.icon} type={row.type} />
                  </span>
                  <span className="global-search-label">{row.label}</span>
                  <span className="global-search-role">{row.role}</span>
                </button>
              );
            }
            if (row.kind === "history") {
              return (
                <button
                  key={row.key}
                  type="button"
                  className={`global-search-row global-search-history${isActive ? " is-active" : ""}`}
                  onClick={() => onSelectRow(row)}
                  onMouseEnter={() => onActivateIndex(index)}
                >
                  <span className="global-search-icon" aria-hidden="true">
                    <MaterialIcon name="history" />
                  </span>
                  <span className="global-search-label">{row.label}</span>
                  {row.snippet ? (
                    <span className="global-search-snippet">{row.snippet}</span>
                  ) : null}
                </button>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
};
