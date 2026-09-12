import { CreateMenuButton } from "@/shared/ui/CreateMenuButton";
import { useMemo } from "react";
import { Input, Spin, Tooltip } from "antd";
import type { Agent } from "@/features/agents/lib/agentState";
import type { Team } from "@/features/workers/lib/workerState";
import { describeCronExpression } from "@/features/automations/lib/cronDescription";
import type {
  AutomationExecutionStatus,
  AutomationSummaryResponse,
} from "@/shared/data";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import styles from "./AutomationListPane.module.css";

const STATUS_ICON: Record<AutomationExecutionStatus, MaterialIconName> = {
  running: "progress_activity",
  success: "check",
  failed: "error",
  canceled: "stop_circle",
};

function workerLabel(
  item: AutomationSummaryResponse,
  agentByKey: Map<string, Agent>,
  teamById: Map<string, Team>,
): string {
  const teamId = String(item.teamId || "").trim();
  if (teamId) return String(teamById.get(teamId)?.name || "--");
  const agentKey = String(item.agentKey || "").trim();
  return String(agentByKey.get(agentKey)?.name || "--");
}

export interface AutomationListPaneProps {
  agents: Agent[];
  automations: AutomationSummaryResponse[];
  error: string;
  loading: boolean;
  search: string;
  selectedId: string;
  teams: Team[];
  onCreate: () => void;
  onCreateConversation?: () => void;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
}

export function AutomationListPane({
  agents,
  automations,
  error,
  loading,
  search,
  selectedId,
  teams,
  onCreate,
  onCreateConversation,
  onRetry,
  onSearchChange,
  onSelect,
}: AutomationListPaneProps) {
  const { locale, t } = useI18n();
  const agentByKey = useMemo(
    () => new Map(agents.map((item) => [item.key, item])),
    [agents],
  );
  const teamById = useMemo(
    () => new Map(teams.map((item) => [item.teamId, item])),
    [teams],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    if (!query) return automations;
    return automations.filter((item) =>
      [
        item.name,
        item.description,
        item.agentKey,
        item.teamId,
        item.cron,
        workerLabel(item, agentByKey, teamById),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase(locale)
        .includes(query),
    );
  }, [agentByKey, automations, locale, search, teamById]);
  const enabled = filtered.filter((item) => item.enabled);
  const disabled = filtered.filter((item) => !item.enabled);

  const renderItem = (item: AutomationSummaryResponse) => {
    const agent = agentByKey.get(String(item.agentKey || ""));
    const last = item.lastExecution;
    return (
      <button
        type="button"
        key={item.id}
        className={`${styles.automationItem} ${item.id === selectedId ? styles.active : ""}`}
        onClick={() => onSelect(item.id)}
      >
        <span className={styles.itemCopy}>
          <span className={styles.itemTitleRow}>
            <span className={styles.itemName} title={item.name || item.id}>
              {item.name || item.id}
            </span>
            <span className={`${styles.enableState} ${item.enabled ? styles.enabled : ""}`}>
              <span className={styles.enableDot} aria-hidden="true" />
              {item.enabled
                ? t("automationConsole.status.enabled")
                : t("automationHistory.status.paused")}
            </span>
          </span>
          <span className={styles.itemSchedule}>
            <span>{describeCronExpression(item.cron, t)}</span>
            <span className={styles.itemWorker}>
              {item.teamId ? (
                <MaterialIcon name="hub" />
              ) : (
                <AgentIcon
                  icon={agent?.icon}
                  type="agent"
                  props={{
                    icon: { width: 14, height: 14 },
                    avatar: { size: 14, icon: <MaterialIcon name="smart_toy" /> },
                  }}
                />
              )}
              {workerLabel(item, agentByKey, teamById)}
            </span>
          </span>
          <span className={styles.itemLast}>
            <span>
              {last
                ? t("automationHistory.last.label", { time: last.startedTime || "--" })
                : t("automationHistory.last.never")}
              {last ? (
                <span className={`${styles.lastStatus} ${styles[last.status]}`}>
                  <MaterialIcon name={STATUS_ICON[last.status]} />
                </span>
              ) : null}
            </span>
          </span>
        </span>
      </button>
    );
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHead}>
        <div className={styles.sidebarSearchRow}>
          <Input
            allowClear
            prefix={<MaterialIcon name="search" />}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("automationConsole.searchPlaceholder")}
          />
          <CreateMenuButton label={t("automationConsole.action.new")} className={`${styles.newButton} ui-icon-hover-24`} onManual={onCreate} onConversation={onCreateConversation} />
        </div>
      </div>
      <div className={styles.automationList}>
        <Spin spinning={loading}>
          {error ? (
            <div className={styles.listError}>
              <span>{error}</span>
              <UiButton size="sm" variant="ghost" onClick={onRetry}>
                {t("automationConsole.action.retry")}
              </UiButton>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyList}>{t("automationConsole.empty")}</div>
          ) : (
            <>
              {enabled.length ? (
                <section className={styles.automationGroup}>
                  <h2>{t("automationHistory.group.enabled", { count: enabled.length })}</h2>
                  {enabled.map(renderItem)}
                </section>
              ) : null}
              {disabled.length ? (
                <section className={styles.automationGroup}>
                  <h2>{t("automationHistory.group.paused", { count: disabled.length })}</h2>
                  {disabled.map(renderItem)}
                </section>
              ) : null}
            </>
          )}
        </Spin>
      </div>
    </aside>
  );
}
