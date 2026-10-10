import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import styles from "./WorkerQuickActions.module.css";

export interface WorkerQuickActionsProps {
  onOpenCommand: (type: "automation" | "agents" | "kbases") => void;
  onOpenMemory: () => void;
  onNewChat: () => void;
  newChatDisabled?: boolean;
}

export function WorkerQuickActions({ onOpenCommand, onOpenMemory, onNewChat, newChatDisabled }: WorkerQuickActionsProps) {
  const { t } = useI18n();
  return (
    <div className={`${styles.actions} left-sidebar-buttons`}>
      <div className={styles.utilityRow}>
        <UiButton size="sm" variant="ghost" onClick={() => onOpenCommand("automation")}>
          <MaterialIcon name="schedule" className="tw:text-[16px]" />
          <span>{t("leftSidebar.quickActions.automation")}</span>
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
      <UiButton className={styles.newChat} size="sm" variant="ghost" onClick={onNewChat} disabled={newChatDisabled}>
        <MaterialIcon name="edit_square" className="tw:text-[16px]" />
        <span>{t("globalSearch.action.newConversation")}</span>
      </UiButton>
    </div>
  );
}
