import React, { useMemo } from "react";
import { Dropdown } from "antd";
import type { Agent, Team, WorkerRow } from "@/app/state/types";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";

type WorkerIcon = Agent["icon"] | Team["icon"];

export const HistoryWorkerSelector: React.FC<{
  worker: Pick<WorkerRow, "key" | "type" | "displayName"> | null;
  workerRows: WorkerRow[];
  workerIconsByKey?: ReadonlyMap<string, WorkerIcon>;
  onChange: (workerKey: string) => void;
}> = ({ worker, workerRows, workerIconsByKey, onChange }) => {
  const { t } = useI18n();
  const menuItems = useMemo(
    () =>
      (Array.isArray(workerRows) ? workerRows : []).map((row) => ({
        key: row.key,
        label: (
          <span className="history-worker-option">
            <AgentIcon
              icon={workerIconsByKey?.get(row.key)}
              type={row.type}
              props={{
                icon: {
                  className: "history-worker-option-icon",
                  width: 20,
                  height: 20,
                },
                avatar: {
                  className: "history-worker-option-icon",
                  size: 20,
                },
              }}
            />
            <span className="history-worker-option-name">{row.displayName}</span>
          </span>
        ),
      })),
    [workerIconsByKey, workerRows],
  );

  return (
    <Dropdown
      menu={{
        items: menuItems,
        onClick: ({ key }) => onChange(String(key)),
      }}
      trigger={["click"]}
      placement="bottomLeft"
    >
      <button
        type="button"
        className="history-worker-selector"
        aria-label={t("history.workerSelector.ariaLabel")}
      >
        {worker ? (
          <AgentIcon
            icon={workerIconsByKey?.get(worker.key)}
            type={worker.type}
            props={{
              icon: {
                className: "history-worker-selector-icon",
                width: 20,
                height: 20,
              },
              avatar: {
                className: "history-worker-selector-icon",
                size: 20,
              },
            }}
          />
        ) : null}
        <span className="history-worker-selector-name">
          {worker?.displayName || t("topNav.noSelection")}
        </span>
        <MaterialIcon
          name="expand_more"
          className="history-worker-selector-chevron"
        />
      </button>
    </Dropdown>
  );
};
