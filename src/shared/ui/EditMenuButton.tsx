import { Dropdown, Flex } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon, type MaterialIconName } from "./MaterialIcon";
import { UiButton } from "./UiButton";

export function focusEditableField(container: HTMLElement | null) {
  // Let the popup finish returning focus to its trigger before focusing the editor.
  requestAnimationFrame(() => {
    const field = container?.querySelector<HTMLElement>(
      'input:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), [contenteditable="true"]',
    );
    field?.scrollIntoView?.({ block: "nearest" });
    field?.focus();
  });
}

interface EditMenuButtonProps {
  label: string;
  disabled?: boolean;
  manualDisabled?: boolean;
  onManual?: () => void;
  onConversation?: () => void;
  onSource?: () => void;
  onStructured?: () => void;
  sourceDisabled?: boolean;
  structuredDisabled?: boolean;
  activeEditMode?: "source" | "structured";
  onCancelEdit?: () => void;
  cancelEditDisabled?: boolean;
}

export function EditMenuButton({
  label,
  disabled,
  manualDisabled,
  onManual,
  onConversation,
  onSource,
  onStructured,
  sourceDisabled,
  structuredDisabled,
  activeEditMode,
  onCancelEdit,
  cancelEditDisabled,
}: EditMenuButtonProps) {
  const { t } = useI18n();
  const displayLabel =
    activeEditMode === "source"
      ? t("resourceAssistant.sourceEdit")
      : activeEditMode === "structured"
        ? t("resourceAssistant.structuredEdit")
        : label;
  const displayIcon: MaterialIconName =
    activeEditMode === "source"
      ? "code"
      : activeEditMode === "structured"
        ? "tune"
        : "edit";
  return (
    <Dropdown
      trigger={["click"]}
      disabled={disabled}
      menu={{
        items: [
          ...(onManual
            ? [
                {
                  key: "manual",
                  label: t("resourceAssistant.directEdit"),
                  disabled: manualDisabled,
                  icon: <MaterialIcon name="edit" />,
                },
              ]
            : []),
          ...(onConversation
            ? [
                {
                  key: "conversation",
                  label: t("resourceAssistant.conversationEdit"),
                  icon: <MaterialIcon name="question_answer" />,
                },
              ]
            : []),
          ...(onSource
            ? [
                {
                  key: "source",
                  label: t("resourceAssistant.sourceEdit"),
                  disabled: sourceDisabled,
                  icon: <MaterialIcon name="code" />,
                },
              ]
            : []),
          ...(onStructured
            ? [
                {
                  key: "structured",
                  label: t("resourceAssistant.structuredEdit"),
                  disabled: structuredDisabled,
                  icon: <MaterialIcon name="tune" />,
                },
              ]
            : []),
          ...(onCancelEdit
            ? [
                { type: "divider" as const },
                {
                  key: "cancelEdit",
                  label: t("resourceAssistant.cancelEdit"),
                  disabled: cancelEditDisabled,
                  icon: <MaterialIcon name="close" />,
                },
              ]
            : []),
        ],
        onClick: ({ key }) => {
          if (key === "manual") onManual?.();
          else if (key === "conversation") onConversation?.();
          else if (key === "source") onSource?.();
          else if (key === "structured") onStructured?.();
          else if (key === "cancelEdit") onCancelEdit?.();
        },
      }}
    >
      <UiButton
        size="sm"
        variant="secondary"
        disabled={disabled}
        aria-label={displayLabel}
        aria-haspopup="menu"
      >
        <Flex gap={4}>
          <MaterialIcon name={displayIcon} />
          <span>{displayLabel}</span>
          <MaterialIcon name="expand_more" />
        </Flex>
      </UiButton>
    </Dropdown>
  );
}
