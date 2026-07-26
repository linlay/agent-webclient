import React, { useEffect } from "react";
import { Popover } from "antd";
import type {
  SlashCommandAvailability,
  ResolvedSlashCommandDefinition,
} from "@/features/composer/lib/slashCommands";
import { isSlashCommandDisabled } from "@/features/composer/lib/slashCommands";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";

const SLASH_COMMAND_POPOVER_CLASS =
  "slash-command-popover tw:max-h-[min(320px,calc(100vh-120px))] tw:overflow-auto tw:rounded-panel tw:border tw:border-line-soft tw:bg-bg-base";
const SLASH_COMMAND_LIST_CLASS =
  "slash-command-list tw:flex tw:flex-col tw:gap-1 tw:p-1";
const SLASH_COMMAND_ITEM_CLASS =
  "slash-command-item ui-icon-hover-24 tw:!w-full tw:!justify-start tw:!rounded-xl tw:!px-2 tw:!py-1.5 tw:text-left tw:hover:!bg-bg-hover tw:[&_.material-icon]:text-[15px] tw:[&_.ui-btn-label]:flex tw:[&_.ui-btn-label]:items-center tw:[&_.ui-btn-label]:gap-2 tw:[&_.ui-btn-label]:overflow-hidden tw:[&_.ui-btn-label]:whitespace-nowrap";
const SLASH_COMMAND_ITEM_STATE_CLASS = {
  idle: "",
  active: "active tw:!bg-bg-hover",
} as const;
const SLASH_COMMAND_NAME_CLASS =
  "slash-command-name tw:font-code tw:text-xs tw:font-semibold tw:text-accent-electric-strong";
const SLASH_COMMAND_LABEL_CLASS =
  "slash-command-label tw:text-xs tw:text-text-main";
const SLASH_COMMAND_CHECK_CLASS =
  "slash-command-check tw:col-start-2 tw:row-span-2 tw:inline-flex tw:items-center tw:self-center tw:text-accent-lime tw:[&_.material-icon]:text-base";
const SLASH_COMMAND_DESCRIPTION_CLASS =
  "slash-command-description tw:overflow-hidden tw:text-ellipsis tw:text-[11px] tw:text-text-muted tw:opacity-80";

const SlashPaletteContent: React.FC<{
  slashPaletteRef: React.RefObject<HTMLDivElement>;
  slashCommands: ResolvedSlashCommandDefinition[];
  activeSlashIndex: number;
  slashAvailability: SlashCommandAvailability;
  planningMode: boolean;
  editingMode?: boolean;
  onSelect: (commandId: ResolvedSlashCommandDefinition["id"]) => void;
}> = ({
  slashPaletteRef,
  slashCommands,
  activeSlashIndex,
  slashAvailability,
  planningMode,
  editingMode = false,
  onSelect,
}) => {
  const { t } = useI18n();
  const itemsRef = React.useRef<HTMLElement[]>([]);

  useEffect(() => {
    itemsRef.current[activeSlashIndex]?.scrollIntoView({ block: "center" });
  }, [activeSlashIndex, itemsRef]);

  return (
    <div ref={slashPaletteRef} className={SLASH_COMMAND_POPOVER_CLASS}>
      <div
        className={SLASH_COMMAND_LIST_CLASS}
        role="listbox"
        aria-label={t("slashPalette.ariaLabel")}
      >
        {slashCommands.map((command, index) => {
          const disabled = isSlashCommandDisabled(
            command.id,
            slashAvailability,
          );
          return (
            <UiButton
              key={command.id}
              ref={(ref) => ref && (itemsRef.current[index] = ref)}
              className={`${SLASH_COMMAND_ITEM_CLASS} ${index === activeSlashIndex ? SLASH_COMMAND_ITEM_STATE_CLASS.active : SLASH_COMMAND_ITEM_STATE_CLASS.idle}`}
              variant="ghost"
              size="sm"
              disabled={disabled}
              role="option"
              aria-selected={index === activeSlashIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(command.id)}
            >
              <MaterialIcon
                name={command.icon}
                className="ui-icon-hover-24-target"
              />
              <span className={SLASH_COMMAND_NAME_CLASS}>{command.command}</span>
              <span className={SLASH_COMMAND_LABEL_CLASS}>{command.label}</span>
              {command.id === "plan" && planningMode && (
                <span className={SLASH_COMMAND_CHECK_CLASS} aria-hidden="true">
                  <MaterialIcon name="check" />
                </span>
              )}
              {command.id === "editing" && editingMode && (
                <span className={SLASH_COMMAND_CHECK_CLASS} aria-hidden="true">
                  <MaterialIcon name="check" />
                </span>
              )}
              <span className={SLASH_COMMAND_DESCRIPTION_CLASS}>
                {command.description}
              </span>
            </UiButton>
          );
        })}
      </div>
    </div>
  );
};

export const SlashPalette: React.FC<{
  open: boolean;
  slashPaletteRef: React.RefObject<HTMLDivElement>;
  slashCommands: ResolvedSlashCommandDefinition[];
  activeSlashIndex: number;
  slashAvailability: SlashCommandAvailability;
  planningMode: boolean;
  editingMode?: boolean;
  slashPopoverWidth?: number;
  getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
  onSelect: (commandId: ResolvedSlashCommandDefinition["id"]) => void;
  children: React.ReactElement;
}> = ({
  open,
  slashPaletteRef,
  slashCommands,
  activeSlashIndex,
  slashAvailability,
  planningMode,
  editingMode = false,
  slashPopoverWidth,
  getPopupContainer,
  onSelect,
  children,
}) => {
  return (
    <Popover
      open={open}
      placement="topLeft"
      arrow={false}
      autoAdjustOverflow
      classNames={{
        root: "slash-command-popover-overlay",
      }}
      styles={{
        root: {
          width: slashPopoverWidth,

          maxWidth: "calc(100vw - 24px)",
          zIndex: 1200,
        },
      }}
      getPopupContainer={getPopupContainer}
      content={
        <SlashPaletteContent
          slashPaletteRef={slashPaletteRef}
          slashCommands={slashCommands}
          activeSlashIndex={activeSlashIndex}
          slashAvailability={slashAvailability}
          planningMode={planningMode}
          editingMode={editingMode}
          onSelect={onSelect}
        />
      }
    >
      {children}
    </Popover>
  );
};
