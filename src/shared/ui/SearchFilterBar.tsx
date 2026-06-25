import React from "react";
import { Dropdown, Input } from "antd";
import type { MenuProps } from "antd";
import { MaterialIcon } from "./MaterialIcon";
import type { MaterialIconName } from "./MaterialIcon";

export interface SearchFilter {
  key: string;
  label: string;
  icon?: MaterialIconName;
  active?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  menu: MenuProps;
}

export interface SearchFilterBarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters: SearchFilter[];
  className?: string;
}

export const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
  searchText,
  onSearchChange,
  searchPlaceholder,
  filters,
  className = "",
}) => {
  return (
    <div className={`search-filter-bar ${className}`.trim()}>
      <Input
        prefix={
          <MaterialIcon
            name="search"
            style={{ color: "var(--text-muted)" }}
          />
        }
        variant="filled"
        placeholder={searchPlaceholder}
        value={searchText}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      {filters.map((filter) => (
        <Dropdown
          key={filter.key}
          menu={filter.menu}
          open={filter.open}
          onOpenChange={filter.onOpenChange}
          trigger={["click"]}
        >
          <button
            type="button"
            className={`filter-trigger ${filter.active ? "is-active" : ""}`}
            title={filter.label}
          >
            <MaterialIcon name={filter.icon || "filter_list"} />
            {filter.active && <span className="filter-indicator" />}
          </button>
        </Dropdown>
      ))}
    </div>
  );
};
