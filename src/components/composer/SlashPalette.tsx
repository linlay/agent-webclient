import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import type {
  SlashCommandAvailability,
  SlashCommandDefinition,
} from "../../lib/slashCommands";
import { isSlashCommandDisabled } from "../../lib/slashCommands";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";

function renderPalette(input: {
  className: string;
  style?: React.CSSProperties;
  slashPaletteRef: React.RefObject<HTMLDivElement>;
  slashCommands: SlashCommandDefinition[];
  activeSlashIndex: number;
  slashAvailability: SlashCommandAvailability;
  planningMode: boolean;
  onSelect: (commandId: SlashCommandDefinition["id"]) => void;
}) {
  const {
    className,
    style,
    slashPaletteRef,
    slashCommands,
    activeSlashIndex,
    slashAvailability,
    planningMode,
    onSelect,
  } = input;
  const itemsRef = React.useRef<HTMLElement[]>([]);

  useEffect(() => {
    itemsRef.current[activeSlashIndex]?.scrollIntoView({ block: "center" });
  }, [activeSlashIndex, itemsRef]);

  return (
    <div
      ref={slashPaletteRef}
      className={`slash-command-popover ${className}`.trim()}
      style={style}
    >
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
}

export const SlashPalette: React.FC<{
  open: boolean;
  slashPaletteRef: React.RefObject<HTMLDivElement>;
  slashCommands: SlashCommandDefinition[];
  activeSlashIndex: number;
  slashAvailability: SlashCommandAvailability;
  planningMode: boolean;
  slashPopoverStyle: {
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    placement: "above" | "below";
  } | null;
  onSelect: (commandId: SlashCommandDefinition["id"]) => void;
}> = ({
  open,
  slashPaletteRef,
  slashCommands,
  activeSlashIndex,
  slashAvailability,
  planningMode,
  slashPopoverStyle,
  onSelect,
}) => {
  if (!open) {
    return null;
  }

  if (slashPopoverStyle && typeof document !== "undefined") {
    return createPortal(
      renderPalette({
        className: "is-portal",
        style: {
          left: slashPopoverStyle.left,
          top: slashPopoverStyle.top,
          width: slashPopoverStyle.width,
          maxHeight: slashPopoverStyle.maxHeight,
        },
        slashPaletteRef,
        slashCommands,
        activeSlashIndex,
        slashAvailability,
        planningMode,
        onSelect,
      }),
      document.body,
    );
  }

  return renderPalette({
    className: "is-inline-fallback",
    slashPaletteRef,
    slashCommands,
    activeSlashIndex,
    slashAvailability,
    planningMode,
    onSelect,
  });
};
