import React, { useEffect } from "react";
import { Popover } from "antd";
import type {
  SlashCommandAvailability,
  SlashCommandDefinition,
} from "@/features/composer/lib/slashCommands";
import { isSlashCommandDisabled } from "@/features/composer/lib/slashCommands";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

const SlashPaletteContent: React.FC<{
  slashPaletteRef: React.RefObject<HTMLDivElement>;
  slashCommands: SlashCommandDefinition[];
  activeSlashIndex: number;
  slashAvailability: SlashCommandAvailability;
  planningMode: boolean;
  onSelect: (commandId: SlashCommandDefinition["id"]) => void;
}> = ({
  slashPaletteRef,
  slashCommands,
  activeSlashIndex,
  slashAvailability,
  planningMode,
  onSelect,
}) => {
  const itemsRef = React.useRef<HTMLElement[]>([]);

  useEffect(() => {
    itemsRef.current[activeSlashIndex]?.scrollIntoView({ block: "center" });
  }, [activeSlashIndex, itemsRef]);

  return (
    <div ref={slashPaletteRef} className="slash-command-popover">
      <div className="slash-command-list" role="listbox" aria-label="斜杠命令">
        {slashCommands.map((command, index) => {
          const disabled = isSlashCommandDisabled(
            command.id,
            slashAvailability,
          );
          return (
            <UiButton
              key={command.id}
              ref={(ref) => ref && (itemsRef.current[index] = ref)}
              className={`slash-command-item ${index === activeSlashIndex ? "active" : ""}`}
              variant="ghost"
              size="sm"
              disabled={disabled}
              role="option"
              aria-selected={index === activeSlashIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(command.id)}
            >
              <span className="slash-command-main">
                <span className="slash-command-name">{command.command}</span>
                <span className="slash-command-label">{command.label}</span>
              </span>
              {command.id === "plan" && planningMode && (
                <span className="slash-command-check" aria-hidden="true">
                  <MaterialIcon name="check" />
                </span>
              )}
              <span className="slash-command-description">
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
  slashCommands: SlashCommandDefinition[];
  activeSlashIndex: number;
  slashAvailability: SlashCommandAvailability;
  planningMode: boolean;
  slashPopoverWidth?: number;
  getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
  onSelect: (commandId: SlashCommandDefinition["id"]) => void;
  children: React.ReactElement;
}> = ({
  open,
  slashPaletteRef,
  slashCommands,
  activeSlashIndex,
  slashAvailability,
  planningMode,
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
          onSelect={onSelect}
        />
      }
    >
      {children}
    </Popover>
  );
};
