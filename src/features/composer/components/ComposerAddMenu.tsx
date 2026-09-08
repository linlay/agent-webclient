import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input, Popover, Switch, Typography } from "antd";
import type { InputRef } from "antd";
import type { Chat } from "@/features/chats/lib/chatState";
import type { ComposerContextReferenceInput } from "@/features/composer/lib/composerAttachments";
import {
  isSlashCommandDisabled,
  type ResolvedSlashCommandDefinition,
  type SlashCommandAvailability,
} from "@/features/composer/lib/slashCommands";
import { getChats, type AgentSkill } from "@/shared/data";
import {
  canUseDesktopWebsBridge,
  listDesktopWebEntries,
  type DesktopWebEntry,
} from "@/shared/data/desktop/desktopWebs";
import { useAgentSkillsQuery } from "@/shared/data/query/queries";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { AgentConnectorPicker } from "@/features/connectors/components/AgentConnectorPicker";

type Section = "files" | "mode" | "skills" | "connectors" | "commands" | "chat" | "site";
export interface AddMenuTriggerProps {
  disabled: boolean;
  loading: boolean;
  currentChatId: string;
  currentAgentKey: string;
  planningMode: boolean;
  editingMode: boolean;
  canUsePlanningMode: boolean;
  canUseEditingMode: boolean;
  isMainChatRunning: boolean;
  selectedSkillKeys: string[];
  slashCommands: ResolvedSlashCommandDefinition[];
  slashAvailability: SlashCommandAvailability;
  onOpenFilePicker: () => void;
  onAddReference: (reference: ComposerContextReferenceInput) => void;
  onTogglePlanningMode: () => void;
  onEditingModeChange: (enabled: boolean) => void;
  onSelectSkill: (skill: AgentSkill) => void;
  onSelectCommand: (id: ResolvedSlashCommandDefinition["id"]) => void;
}

// 每个面板可指定宽度（px），缺省 200
const sectionMeta: Record<
  Section,
  { icon: MaterialIconName; key: string; detailWidth?: number }
> = {
  files: { icon: "attach_file", key: "composer.addMenu.section.files" },
  mode: { icon: "checklist", key: "composer.addMenu.section.mode" },
  skills: {
    icon: "skills",
    key: "composer.addMenu.section.skills",
    detailWidth: 320,
  },
  connectors: {
    icon: "hub",
    key: "composer.addMenu.section.connectors",
    detailWidth: 240,
  },
  commands: {
    icon: "terminal",
    key: "composer.addMenu.section.commands",
    detailWidth: 320,
  },
  chat: {
    icon: "question_answer",
    key: "composer.addMenu.section.chat",
    detailWidth: 320,
  },
  site: {
    icon: "open_in_new",
    key: "composer.addMenu.section.site",
    detailWidth: 320,
  },
};
// 一级面板导航条目："divider" 为分割线，可自由插入任意位置
type NavEntry = Section | "divider";
const sectionNav: NavEntry[] = [
  "files",
  "divider",
  "mode",
  "skills",
  "connectors",
  "commands",
  "chat",
  "site",
];
const DEFAULT_DETAIL_WIDTH = 200;
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const normalizeChats = (value: unknown): Chat[] =>
  Array.isArray(value)
    ? value.filter((chat): chat is Chat =>
        Boolean(chat && text((chat as Chat).chatId)),
      )
    : [];

const searchPlaceholderKey: Partial<Record<Section, string>> = {
  skills: "composer.addMenu.search.skills",
  commands: "composer.addMenu.search.commands",
  chat: "composer.addMenu.chat.search",
  site: "composer.addMenu.site.search",
};

const AddMenuSectionDetail: React.FC<
  AddMenuTriggerProps & {
    section: Section;
    onClose: () => void;
    search: string;
    onSearchChange: (value: string) => void;
  }
> = (props) => {
  const { t } = useI18n();
  const { section, search, onSearchChange } = props;
  const searchRef = useRef<InputRef>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [sites, setSites] = useState<DesktopWebEntry[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);
  const searchable = Boolean(searchPlaceholderKey[section]);
  const keyword = search.trim().toLowerCase();
  const matchKeyword = (...values: string[]) =>
    !keyword || values.some((value) => value.toLowerCase().includes(keyword));
  const skillQuery = useAgentSkillsQuery(props.currentAgentKey, {
    enabled: section === "skills",
  });
  const skills = skillQuery.data?.skills || [];
  const filteredSkills = skills.filter((skill) =>
    matchKeyword(skill.name || skill.key, skill.key, skill.description || ""),
  );
  const filteredCommands = props.slashCommands.filter((command) =>
    matchKeyword(command.label, command.description, command.id),
  );
  const filteredChats = chats.filter((chat) =>
    matchKeyword(text(chat.chatName) || chat.chatId, chat.chatId),
  );
  const filteredSites = sites.filter((site) =>
    matchKeyword(site.label, site.url || "", site.entryKey),
  );
  const selected = useMemo(
    () =>
      new Set(props.selectedSkillKeys.map((key) => text(key).toLowerCase())),
    [props.selectedSkillKeys],
  );
  const siteAvailable = canUseDesktopWebsBridge();
  useEffect(() => {
    if (!searchable) return;
    // 等待 Popover 动画后再聚焦，避免 autoFocus 在挂载时机下失效
    const timer = window.setTimeout(() => {
      searchRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [searchable]);
  useEffect(() => {
    if (section !== "chat" && section !== "site") return;
    setLoadingContext(true);
    if (section === "chat") {
      void getChats({ agentKey: props.currentAgentKey })
        .then((chatResult) => {
          setChats(
            normalizeChats(chatResult.data).filter(
              (chat) => text(chat.chatId) !== text(props.currentChatId),
            ),
          );
        })
        .catch(() => undefined)
        .finally(() => setLoadingContext(false));
    } else {
      void (siteAvailable ? listDesktopWebEntries() : Promise.resolve([]))
        .then((nextSites) => {
          setSites(nextSites);
        })
        .catch(() => undefined)
        .finally(() => setLoadingContext(false));
    }
  }, [props.currentAgentKey, props.currentChatId, section, siteAvailable]);
  const execute = (action: () => void) => {
    action();
    props.onClose();
  };
  const item = (
    content: React.ReactNode,
    action: () => void,
    disabled = false,
  ) => (
    <UiButton
      variant="ghost"
      size="sm"
      className="composer-add-menu-detail-item"
      disabled={disabled}
      onClick={() => execute(action)}
    >
      {content}
    </UiButton>
  );
  const detailWidth = sectionMeta[section].detailWidth || DEFAULT_DETAIL_WIDTH;
  return (
    <div
      className="composer-add-menu-detail"
      style={{ width: `min(${detailWidth}px, calc(100vw - 24px))` }}
    >
      {searchable && (
        <Input
          ref={searchRef}
          prefix={<MaterialIcon name="search" />}
          variant="filled"
          value={search}
          placeholder={t(searchPlaceholderKey[section] || "")}
          onChange={(event) => onSearchChange(event.target.value)}
          style={{ marginBottom: 10 }}
        />
      )}
      {section === "connectors" && <AgentConnectorPicker key={props.currentAgentKey} agentKey={props.currentAgentKey}
        search={search} onSearchChange={onSearchChange} disabled={props.disabled} />}
      {section === "files" &&
        item(
          <>
            <MaterialIcon name="folder" />
            <span>{t("composer.addMenu.file")}</span>
          </>,
          props.onOpenFilePicker,
        )}
      {section === "mode" && (
        <div className="composer-add-menu-mode">
          {props.canUsePlanningMode &&
            item(
              <>
                <span>{t("composer.addMenu.mode.planning")}</span>
                <Switch size="small" checked={props.planningMode} />
              </>,
              props.onTogglePlanningMode,
            )}
          {!props.canUsePlanningMode &&
            props.canUseEditingMode &&
            item(
              <>
                <span>{t("composer.addMenu.mode.editing")}</span>
                <Switch size="small" checked={props.editingMode} />
              </>,
              () => props.onEditingModeChange(!props.editingMode),
            )}
        </div>
      )}
      {section === "skills" && (
        <div className="composer-add-menu-scroll">
          {filteredSkills.map((skill) =>
            item(
              <>
                <MaterialIcon name="skills" />
                <span className="composer-add-menu-item-copy">
                  <b>{skill.name || skill.key}</b>
                  <small>
                    {skill.description || t("slashPalette.skill.noDescription")}
                  </small>
                </span>
                {selected.has(skill.key.toLowerCase()) && (
                  <MaterialIcon name="check" />
                )}
              </>,
              () => props.onSelectSkill(skill),
              props.isMainChatRunning,
            ),
          )}
          {skillQuery.status === "loading" && (
            <div className="composer-add-menu-status">
              {t("slashPalette.skills.loading")}
            </div>
          )}
          {skillQuery.status === "error" && (
            <div
              className="composer-add-menu-status"
              title={skillQuery.error?.message}
            >
              {t("slashPalette.skills.loadFailed")}
              <UiButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  void skillQuery.refetch().catch(() => undefined);
                }}
              >
                {t("slashPalette.skills.retry")}
              </UiButton>
            </div>
          )}
          {skillQuery.status === "success" && !skills.length && (
            <div className="composer-add-menu-status">
              {t("slashPalette.skills.empty")}
            </div>
          )}
          {skillQuery.status === "success" &&
            !!skills.length &&
            !filteredSkills.length && (
              <div className="composer-add-menu-status">
                {t("composer.addMenu.empty")}
              </div>
            )}
        </div>
      )}
      {section === "commands" && (
        <div className="composer-add-menu-scroll">
          {filteredCommands.map((command) =>
            item(
              <>
                <MaterialIcon name={command.icon} />
                <span className="composer-add-menu-item-copy">
                  <b>{command.label}</b>
                  <small>{command.description}</small>
                </span>
              </>,
              () => props.onSelectCommand(command.id),
              isSlashCommandDisabled(command.id, props.slashAvailability),
            ),
          )}
          {!filteredCommands.length && (
            <div className="composer-add-menu-status">
              {t("composer.addMenu.empty")}
            </div>
          )}
        </div>
      )}
      {section === "chat" && (
        <div className="composer-add-menu-scroll">
          {loadingContext && (
            <div className="composer-add-menu-status">
              {t("composer.addMenu.loading")}
            </div>
          )}
          {!loadingContext && !chats.length && (
            <div className="composer-add-menu-status">
              {t("composer.addMenu.chat.empty")}
            </div>
          )}
          {!loadingContext && !!chats.length && !filteredChats.length && (
            <div className="composer-add-menu-status">
              {t("composer.addMenu.empty")}
            </div>
          )}
          {filteredChats.map((chat) =>
            item(
              <>
                <MaterialIcon name="question_answer" />
                <Typography.Text ellipsis>
                  {text(chat.chatName) || chat.chatId}
                </Typography.Text>
              </>,
              () =>
                props.onAddReference({
                  type: "chat",
                  id: chat.chatId,
                  name: text(chat.chatName) || chat.chatId,
                }),
            ),
          )}
        </div>
      )}
      {section === "site" && (
        <div className="composer-add-menu-scroll">
          {loadingContext && (
            <div className="composer-add-menu-status">
              {t("composer.addMenu.loading")}
            </div>
          )}
          {!loadingContext && !sites.length && (
            <div className="composer-add-menu-status">
              {t("composer.addMenu.site.empty")}
            </div>
          )}
          {!loadingContext && !!sites.length && !filteredSites.length && (
            <div className="composer-add-menu-status">
              {t("composer.addMenu.empty")}
            </div>
          )}
          {filteredSites.map((site) =>
            item(
              <>
                <MaterialIcon name="open_in_new" />
                <span>{site.label}</span>
              </>,
              () =>
                props.onAddReference({
                  type: "site",
                  id: site.entryKey,
                  name: site.label,
                  ...(site.url ? { url: site.url } : {}),
                }),
            ),
          )}
        </div>
      )}
    </div>
  );
};

const AddMenuPanel: React.FC<AddMenuTriggerProps & { onClose: () => void }> = (
  props,
) => {
  const { t } = useI18n();
  const [section, setSection] = useState<Section | null>(null);
  const [search, setSearch] = useState("");
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.innerWidth < 560);
  useEffect(() => {
    const updateCompact = () => setCompact(window.innerWidth < 560);
    window.addEventListener("resize", updateCompact);
    return () => window.removeEventListener("resize", updateCompact);
  }, []);
  // 切换面板时重置搜索词，与原先面板销毁重建的行为保持一致
  useEffect(() => {
    setSearch("");
  }, [section]);
  // mode / site 在不可用时跳过，分割线条目保持原位
  const navEntries = sectionNav.filter((entry) => {
    if (entry === "divider") return true;
    if (entry === "site") return canUseDesktopWebsBridge();
    if (entry === "mode")
      return props.canUsePlanningMode || props.canUseEditingMode;
    return true;
  });
  // A side-by-side submenu cannot fit narrow chat windows. Reuse the parent
  // popover for this picker so the search and switches stay within the viewport.
  if (compact && section === "connectors") {
    return <div>
      <UiButton variant="ghost" size="sm" className="composer-add-menu-detail-item" onClick={() => setSection(null)}>
        <MaterialIcon name="chevron_left" />{t("composer.addMenu.connectors.back")}
      </UiButton>
      <AddMenuSectionDetail {...props} section="connectors" onClose={props.onClose} search={search} onSearchChange={setSearch} />
    </div>;
  }
  return (
    <div className="composer-add-menu-nav" role="menu">
      {navEntries.map((entry, index) =>
        entry === "divider" ? (
          <div
            key={`divider-${index}`}
            className="composer-add-menu-divider"
            aria-hidden="true"
          />
        ) : (
          <Popover
            key={entry}
            open={section === entry}
            onOpenChange={(next) => {
              // 搜索框有内容时不响应 hover 移出关闭，避免输入中被误关
              if (!next && search.trim()) return;
              setSection((prev) =>
                next ? entry : prev === entry ? null : prev,
              );
            }}
            trigger="hover"
            placement="rightBottom"
            arrow={false}
            destroyOnHidden
            mouseEnterDelay={0.05}
            mouseLeaveDelay={0.15}
            classNames={{ root: "composer-add-menu-overlay" }}
            content={
              <AddMenuSectionDetail
                {...props}
                section={entry}
                onClose={props.onClose}
                search={search}
                onSearchChange={setSearch}
              />
            }
          >
            <UiButton
              variant="ghost"
              size="sm"
              role="menuitem"
              className={`composer-add-menu-nav-item ${section === entry ? "is-active" : ""}`}
              onClick={() => setSection(entry)}
              onFocus={() => setSection(entry)}
            >
              <MaterialIcon name={sectionMeta[entry].icon} />
              <span>{t(sectionMeta[entry].key)}</span>
              <MaterialIcon name="keyboard_arrow_right" />
            </UiButton>
          </Popover>
        ),
      )}
    </div>
  );
};

export const AddMenuTrigger: React.FC<AddMenuTriggerProps> = (props) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="topLeft"
      arrow={false}
      destroyOnHidden
      classNames={{ root: "composer-add-menu-overlay" }}
      content={<AddMenuPanel {...props} onClose={() => setOpen(false)} />}
    >
      <UiButton
        className={`composer-plus-btn tw:!grid tw:!h-8 tw:!min-h-8 tw:!w-8 tw:!min-w-8 tw:!place-items-center tw:!rounded-lg tw:!border-0 tw:!p-0 tw:!text-ink-2 tw:hover:!bg-bg-hover ${open ? "is-open" : ""}`}
        variant="ghost"
        size="sm"
        iconOnly
        loading={props.loading}
        disabled={props.disabled}
        aria-label={t("composer.addMenu.open")}
        title={t("composer.addMenu.open")}
      >
        <MaterialIcon name="add" />
      </UiButton>
    </Popover>
  );
};
