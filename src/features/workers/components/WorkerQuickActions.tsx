import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import styles from "./WorkerQuickActions.module.css";

export interface WorkerQuickActionsProps {
  onOpenCommand: (type: "automation" | "agents" | "kbases") => void;
  onOpenMemory: () => void;
}

export function WorkerQuickActions({ onOpenCommand, onOpenMemory }: WorkerQuickActionsProps) {
  const { t } = useI18n();
  return (
    <div className={`${styles.actions} left-sidebar-buttons`}>
      <UiButton size="sm" variant="ghost" onClick={() => onOpenCommand("automation")}>
        <MaterialIcon name="schedule" className="tw:text-[16px]" />
        <span>{t("leftSidebar.quickActions.automation")}</span>
      </UiButton>
      <UiButton size="sm" variant="ghost" onClick={() => onOpenCommand("agents")}>
        <MaterialIcon name="agent_type" className="tw:text-[16px]" />
        <span>{t("leftSidebar.quickActions.agents")}</span>
      </UiButton>
      <UiButton size="sm" variant="ghost" onClick={() => onOpenCommand("kbases")}>
        <MaterialIcon name="database" className="tw:text-[16px]" />
        <span>{t("leftSidebar.quickActions.kbases")}</span>
      </UiButton>
      <UiButton size="sm" variant="ghost" onClick={onOpenMemory}>
        <MaterialIcon name="psychology" className="tw:text-[16px]" />
        <span>{t("leftSidebar.quickActions.memory")}</span>
      </UiButton>
    </div>
  );
}
