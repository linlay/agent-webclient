import { Dropdown } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "./MaterialIcon";
import { UiButton } from "./UiButton";

export function focusEditableField(container: HTMLElement | null) {
  // Let the popup finish returning focus to its trigger before focusing the editor.
  requestAnimationFrame(() => {
    const field = container?.querySelector<HTMLElement>('input:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), [contenteditable="true"]');
    field?.scrollIntoView?.({ block: "nearest" });
    field?.focus();
  });
}

interface EditMenuButtonProps {
  label: string;
  disabled?: boolean;
  manualDisabled?: boolean;
  onManual: () => void;
  onConversation?: () => void;
}

export function EditMenuButton({ label, disabled, manualDisabled, onManual, onConversation }: EditMenuButtonProps) {
  const { t } = useI18n();
  return <Dropdown trigger={["click"]} disabled={disabled} menu={{
    items: [
      { key: "manual", label: t("resourceAssistant.directEdit"), disabled: manualDisabled, icon: <MaterialIcon name="edit" /> },
      ...(onConversation ? [{ key: "conversation", label: t("resourceAssistant.conversationEdit"), icon: <MaterialIcon name="question_answer" /> }] : []),
    ],
    onClick: ({ key }) => { if (key === "manual") onManual(); else if (key === "conversation") onConversation?.(); },
  }}>
    <UiButton size="sm" variant="secondary" disabled={disabled} aria-label={label} aria-haspopup="menu">
      <MaterialIcon name="edit" />{label}<MaterialIcon name="expand_more" />
    </UiButton>
  </Dropdown>;
}
