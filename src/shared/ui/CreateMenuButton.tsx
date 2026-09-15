import { Dropdown } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "./MaterialIcon";
import { UiButton } from "./UiButton";

interface CreateMenuButtonProps {
  label: string;
  manualLabel?: string;
  disabled?: boolean;
  className?: string;
  onManual: () => void;
  onConversation?: () => void;
}

export function CreateMenuButton({ label, manualLabel, disabled, className, onManual, onConversation }: CreateMenuButtonProps) {
  const { t } = useI18n();
  return (
    <Dropdown trigger={["click"]} disabled={disabled} menu={{
      items: [
        { key: "manual", label: manualLabel || t("resourceAssistant.manualCreate"), icon: <MaterialIcon name="edit" /> },
        ...(onConversation ? [{ key: "conversation", label: t("resourceAssistant.create"), icon: <MaterialIcon name="question_answer" /> }] : []),
      ],
      onClick: ({ key }) => { if (key === "manual") onManual(); else if (key === "conversation") onConversation?.(); },
    }}>
      <UiButton size="sm" variant="primary" iconOnly className={className} disabled={disabled} aria-label={label} title={label} aria-haspopup="menu">
        <MaterialIcon name="add" />
      </UiButton>
    </Dropdown>
  );
}
