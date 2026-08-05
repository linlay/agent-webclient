import React, { useEffect } from "react";
import { Popover, Tag, Typography } from "antd";
import type {
  SlashCommandAvailability,
  ResolvedSlashCommandDefinition,
  ResolvedSlashSkillDefinition,
} from "@/features/composer/lib/slashCommands";
import { isSlashCommandDisabled } from "@/features/composer/lib/slashCommands";
import type { DataQueryStatus } from "@/shared/data/query/serverState";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";

const SLASH_COMMAND_POPOVER_CLASS =
  "slash-command-popover tw:max-h-[min(360px,calc(100vh-120px))] tw:overflow-auto tw:rounded-panel tw:border tw:border-line-soft tw:bg-bg-base";
const SLASH_COMMAND_LIST_CLASS =
  "slash-command-list tw:flex tw:flex-col tw:gap-1 tw:p-1";
const SLASH_GROUP_LABEL_CLASS =
  "tw:px-2 tw:pb-0.5 tw:pt-1.5 tw:text-xs tw:font-bold tw:tracking-[0.08em] tw:text-text-muted tw:sticky tw:top-0 tw:bg-bg-base tw:z-10";
const SLASH_COMMAND_ITEM_CLASS = "slash-command-item";
const SLASH_COMMAND_ITEM_STATE_CLASS = {
  idle: "",
  active: "active tw:!bg-bg-hover",
} as const;
const SLASH_COMMAND_LABEL_CLASS =
  "slash-command-label tw:text-xs tw:text-text-main";
const SLASH_COMMAND_CHECK_CLASS =
  "slash-command-check tw:col-start-4 tw:row-span-2 tw:inline-flex tw:items-center tw:self-center tw:text-accent-lime tw:[&_.material-icon]:text-base";
const SLASH_COMMAND_DESCRIPTION_CLASS =
  "slash-command-description tw:text-text-muted tw:flex-1";
const SLASH_SKILL_SOURCE_CLASS = " tw:text-xs tw:mr-0 tw:text-text-sub";
const SLASH_STATUS_CLASS =
  "tw:flex tw:min-h-12 tw:items-center tw:justify-between tw:gap-3 tw:rounded-xl tw:px-2 tw:py-2 tw:text-xs tw:text-text-muted";

function itemStateClass(active: boolean): string {
  return active
    ? SLASH_COMMAND_ITEM_STATE_CLASS.active
    : SLASH_COMMAND_ITEM_STATE_CLASS.idle;
}

const SlashPaletteContent: React.FC<{
  slashPaletteRef: React.RefObject<HTMLDivElement>;
  slashCommands: ResolvedSlashCommandDefinition[];
  slashSkills: ResolvedSlashSkillDefinition[];
  slashSkillStatus: DataQueryStatus;
  slashSkillError: Error | null;
  activeSlashIndex: number;
  slashAvailability: SlashCommandAvailability;
  planningMode: boolean;
  editingMode?: boolean;
  selectedSkillKeys: string[];
  skillsDisabled: boolean;
  onSelectCommand: (commandId: ResolvedSlashCommandDefinition["id"]) => void;
  onSelectSkill: (skill: ResolvedSlashSkillDefinition) => void;
  onRetrySkills: () => void;
}> = ({
  slashPaletteRef,
  slashCommands,
  slashSkills,
  slashSkillStatus,
  slashSkillError,
  activeSlashIndex,
  slashAvailability,
  planningMode,
  editingMode = false,
  selectedSkillKeys,
  skillsDisabled,
  onSelectCommand,
  onSelectSkill,
  onRetrySkills,
}) => {
  const { t } = useI18n();
  const itemsRef = React.useRef<HTMLElement[]>([]);
  const selectedSkillIdentities = new Set(
    selectedSkillKeys.map((key) =>
      String(key || "")
        .trim()
        .toLowerCase(),
    ),
  );

  useEffect(() => {
    itemsRef.current[activeSlashIndex]?.scrollIntoView({ block: "center" });
  }, [activeSlashIndex]);

  const showSkillSection = slashSkillStatus !== "idle";
  const showSkillState = showSkillSection && slashSkills.length === 0;

  return (
    <div ref={slashPaletteRef} className={SLASH_COMMAND_POPOVER_CLASS}>
      <div
        className={SLASH_COMMAND_LIST_CLASS}
        role="listbox"
        aria-label={t("slashPalette.ariaLabel")}
      >
        {slashCommands.length > 0 ? (
          <div className={SLASH_GROUP_LABEL_CLASS}>
            {t("slashPalette.group.commands")}
          </div>
        ) : null}
        {slashCommands.map((command, index) => {
          const disabled = isSlashCommandDisabled(
            command.id,
            slashAvailability,
          );
          return (
            <UiButton
              key={`command:${command.id}`}
              ref={(ref) => ref && (itemsRef.current[index] = ref)}
              className={`${SLASH_COMMAND_ITEM_CLASS} ${itemStateClass(index === activeSlashIndex)}`}
              variant="ghost"
              size="sm"
              disabled={disabled}
              role="option"
              aria-selected={index === activeSlashIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectCommand(command.id)}
            >
              <MaterialIcon
                name={command.icon}
                className="ui-icon-hover-24 tw:text-accent"
              />
              <span className={SLASH_COMMAND_LABEL_CLASS}>{command.label}</span>
              <Typography.Text
                className={SLASH_COMMAND_DESCRIPTION_CLASS}
                ellipsis={{
                  tooltip: {
                    title: command.description,
                    placement: "topRight",
                  },
                }}
              >
                {command.description}
              </Typography.Text>
              {command.id === "plan" && planningMode ? (
                <span className={SLASH_COMMAND_CHECK_CLASS} aria-hidden="true">
                  <MaterialIcon name="check" />
                </span>
              ) : null}
              {command.id === "editing" && editingMode ? (
                <span className={SLASH_COMMAND_CHECK_CLASS} aria-hidden="true">
                  <MaterialIcon name="check" />
                </span>
              ) : null}
              <Tag className={SLASH_SKILL_SOURCE_CLASS}>{command.command}</Tag>
            </UiButton>
          );
        })}

        {showSkillSection ? (
          <div className={SLASH_GROUP_LABEL_CLASS}>
            {t("slashPalette.group.skills")}
          </div>
        ) : null}
        {slashSkills.map((skill, skillIndex) => {
          const index = slashCommands.length + skillIndex;
          const selected = selectedSkillIdentities.has(skill.key.toLowerCase());
          return (
            <UiButton
              key={`skill:${skill.key.toLowerCase()}`}
              ref={(ref) => ref && (itemsRef.current[index] = ref)}
              className={`${SLASH_COMMAND_ITEM_CLASS} ${itemStateClass(index === activeSlashIndex)}`}
              variant="ghost"
              size="sm"
              disabled={skillsDisabled}
              role="option"
              aria-selected={index === activeSlashIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectSkill(skill)}
            >
              <MaterialIcon
                name="skills"
                className="ui-icon-hover-24 tw:text-accent"
              />
              <span className={SLASH_COMMAND_LABEL_CLASS}>{skill.label}</span>
              <Typography.Text
                className={SLASH_COMMAND_DESCRIPTION_CLASS}
                ellipsis={{
                  tooltip: {
                    title: skill.description,
                    placement: "topRight",
                  },
                }}
              >
                {skill.description || t("slashPalette.skill.noDescription")}
              </Typography.Text>
              {selected && (
                <span className={SLASH_COMMAND_CHECK_CLASS} aria-hidden="true">
                  <MaterialIcon name="check" />
                </span>
              )}
              <Tag className={SLASH_SKILL_SOURCE_CLASS}>
                {skill.agentHasSkill
                  ? t("slashPalette.skill.source.agent")
                  : t("slashPalette.skill.source.market")}
              </Tag>
            </UiButton>
          );
        })}

        {showSkillState && slashSkillStatus === "loading" ? (
          <div className={SLASH_STATUS_CLASS} role="status">
            {t("slashPalette.skills.loading")}
          </div>
        ) : null}
        {showSkillState && slashSkillStatus === "success" ? (
          <div className={SLASH_STATUS_CLASS} role="status">
            {t("slashPalette.skills.empty")}
          </div>
        ) : null}
        {showSkillState && slashSkillStatus === "error" ? (
          <div
            className={SLASH_STATUS_CLASS}
            role="alert"
            title={slashSkillError?.message}
          >
            <span>{t("slashPalette.skills.loadFailed")}</span>
            <UiButton variant="ghost" size="sm" onClick={onRetrySkills}>
              {t("slashPalette.skills.retry")}
            </UiButton>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const SlashPalette: React.FC<{
  open: boolean;
  slashPaletteRef: React.RefObject<HTMLDivElement>;
  slashCommands: ResolvedSlashCommandDefinition[];
  slashSkills: ResolvedSlashSkillDefinition[];
  slashSkillStatus: DataQueryStatus;
  slashSkillError: Error | null;
  activeSlashIndex: number;
  slashAvailability: SlashCommandAvailability;
  planningMode: boolean;
  editingMode?: boolean;
  selectedSkillKeys: string[];
  skillsDisabled: boolean;
  slashPopoverWidth?: number;
  getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
  onSelectCommand: (commandId: ResolvedSlashCommandDefinition["id"]) => void;
  onSelectSkill: (skill: ResolvedSlashSkillDefinition) => void;
  onRetrySkills: () => void;
  children: React.ReactElement;
}> = ({
  open,
  slashPaletteRef,
  slashCommands,
  slashSkills,
  slashSkillStatus,
  slashSkillError,
  activeSlashIndex,
  slashAvailability,
  planningMode,
  editingMode = false,
  selectedSkillKeys,
  skillsDisabled,
  slashPopoverWidth,
  getPopupContainer,
  onSelectCommand,
  onSelectSkill,
  onRetrySkills,
  children,
}) => {
  return (
    <Popover
      open={open}
      placement="topLeft"
      arrow={false}
      autoAdjustOverflow
      classNames={{ root: "slash-command-popover-overlay" }}
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
          slashSkills={slashSkills}
          slashSkillStatus={slashSkillStatus}
          slashSkillError={slashSkillError}
          activeSlashIndex={activeSlashIndex}
          slashAvailability={slashAvailability}
          planningMode={planningMode}
          editingMode={editingMode}
          selectedSkillKeys={selectedSkillKeys}
          skillsDisabled={skillsDisabled}
          onSelectCommand={onSelectCommand}
          onSelectSkill={onSelectSkill}
          onRetrySkills={onRetrySkills}
        />
      }
    >
      {children}
    </Popover>
  );
};
