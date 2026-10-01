import { skillDisplayName, skillPackageDisplayName } from "@/shared/utils/skillDisplayName";
import { SkinVisual } from "@/shared/ui/SkinVisual";
import React, { useEffect, useRef, useState } from "react";
import { Input, Popover, Typography } from "antd";
import type { InputRef } from "antd";
import type { Chat } from "@/features/chats/lib/chatState";
import type { ComposerContextReferenceInput } from "@/features/composer/lib/composerAttachments";
import { getChats, type AgentSkill } from "@/shared/data";
import {
  canUseDesktopWebsBridge,
  listDesktopWebEntries,
  type DesktopWebEntry,
} from "@/shared/data/desktop/desktopWebs";
import { useComposerSkillMenuQuery } from "@/features/composer/hooks/useComposerSkillMenuQuery";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { AgentConnectorPicker } from "@/features/connectors/components/AgentConnectorPicker";
import { SkillIcon } from "@/features/skills/components/SkillIcon";
import { PackageSkillTree } from "./PackageSkillTree";
import { packageMembers, skillIdentity } from "../lib/skillPackages";
import { SkillKindFilters } from "@/features/skills/components/SkillKindFilters";
import { orderSkillCatalogItems, type SkillKindFilter } from "@/features/skills/lib/skillCatalogView";

type Section = "files" | "skills" | "connectors" | "chat" | "site";
export interface AddMenuTriggerProps {
  interactionConfig?: import("@/shared/contracts/interaction").InteractionConfig;
  disabled: boolean;
  loading: boolean;
  currentChatId: string;
  currentAgentKey: string;
  planningMode: boolean;
  editingMode: boolean;
  canUsePlanningMode: boolean;
  canUseEditingMode: boolean;
  isMainChatRunning: boolean;
  canCaptureDesktopScreenshot: boolean;
  isCapturingDesktopScreenshot: boolean;
  selectedSkillIds: string[];
  selectedPackageId?: string;
  lockedSkillIds?: string[];
  onSelectSkills?: (skills: AgentSkill[], selected: boolean, packageId?: string) => void;
  onOpenFilePicker: () => void;
  onCaptureScreenshot: () => void;
  /** 仅在截屏不可用时作为悬浮说明；可用时留空，标签本身已说明动作 */
  screenshotDisabledReason?: string;
  onAddReference: (reference: ComposerContextReferenceInput) => void;
  onTogglePlanningMode: () => void;
  onEditingModeChange: (enabled: boolean) => void;
  onSelectSkill: (skill: AgentSkill) => void;
}

// 每个面板可指定宽度（px），缺省 200
const sectionMeta: Record<
  Section,
  { icon: MaterialIconName; key: string; detailWidth?: number }
> = {
  files: { icon: "attach_file", key: "composer.addMenu.section.files" },
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
type NavEntry = Section | "screenshot" | "mode" | "divider";
const sectionNav: NavEntry[] = [
  "files",
  "screenshot",
  "divider",
  "mode",
  "skills",
  "connectors",
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
  chat: "composer.addMenu.chat.search",
  site: "composer.addMenu.site.search",
};

const AddMenuSectionDetail: React.FC<
  AddMenuTriggerProps & {
    section: Section;
    onClose: () => void;
    search: string;
    onSearchChange: (value: string) => void;
    onInteract?: () => void;
  }
> = (props) => {
  const { t, locale } = useI18n();
  const { section, search, onSearchChange } = props;
  const [kindFilter, setKindFilter] = useState<SkillKindFilter>(null);
  const searchRef = useRef<InputRef>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [sites, setSites] = useState<DesktopWebEntry[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);
  const searchable = Boolean(searchPlaceholderKey[section]);
  const keyword = search.trim().toLowerCase();
  const matchKeyword = (...values: string[]) =>
    !keyword || values.some((value) => value.toLowerCase().includes(keyword));
  const skillQuery = useComposerSkillMenuQuery(props.currentAgentKey, {
    enabled: section === "skills",
  });
  const skills = skillQuery.data?.skills || [];
  const {
    pinnedSkillIds,
    toggleSkillPin,
    pinsDisabled,
    pinError,
    refreshPins,
  } = skillQuery;
  const packages = skillQuery.data?.packages || [];
  const memberKeys = new Set(packages.flatMap(pkg => pkg.skills.map(member => skillIdentity(member.id))));
  const filteredPackages = packages.filter(pkg => matchKeyword(skillPackageDisplayName(pkg), pkg.id, ...(pkg.missingSkillIds || []),
    ...packageMembers(pkg, skills).flatMap(skill => [skillDisplayName(skill), skill.id, skill.description || ""])));
  const filteredSkills = skills.filter(skill => !memberKeys.has(skillIdentity(skill.id))).filter(
    (skill) =>
      matchKeyword(skillDisplayName(skill), skill.id, skill.description || ""),
  );
  const catalogItems = orderSkillCatalogItems([
    ...filteredPackages.map(pkg => ({ kind: "package" as const, id: pkg.id, label: skillPackageDisplayName(pkg), pkg })),
    ...filteredSkills.map(skill => ({ kind: "standalone" as const, id: skill.id, label: skillDisplayName(skill), skill })),
  ], pinnedSkillIds, locale).filter(item => !kindFilter || item.kind === kindFilter);
  const filteredChats = chats.filter((chat) =>
    matchKeyword(text(chat.chatName) || chat.chatId, chat.chatId),
  );
  const filteredSites = sites.filter((site) =>
    matchKeyword(site.label, site.url || "", site.entryKey),
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
    options: { disabled?: boolean; loading?: boolean; title?: string } = {},
  ) => (
    <UiButton
      variant="ghost"
      size="sm"
      className="composer-add-menu-detail-item"
      loading={options.loading}
      disabled={options.disabled}
      title={options.title}
      onClick={() => execute(action)}
    >
      {content}
    </UiButton>
  );
  const renderSkill = (skill: AgentSkill) => {
    const identity = text(skill.id).toLowerCase();
    const pinned = pinnedSkillIds.includes(identity);
    const skillName = skillDisplayName(skill);
    const pinLabel = t(
      pinned
        ? "composer.addMenu.skill.unpin"
        : "composer.addMenu.skill.pin",
      { name: skillName },
    );
    const selectDisabled = props.isMainChatRunning;
    return (
      // 点击整行选择，置顶按钮独立操作。
      <div
        key={skill.id}
        className={`composer-add-menu-skill-row composer-add-menu-skill-select${selectDisabled ? " is-disabled" : ""}`}
        data-pinned={pinned || undefined}
        role="button"
        tabIndex={selectDisabled ? -1 : 0}
        aria-disabled={selectDisabled}
        aria-label={t("composer.addMenu.skill.select", { name: skillName })}
        onClick={() => {
          if (!selectDisabled) execute(() => props.onSelectSkill(skill));
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!selectDisabled) execute(() => props.onSelectSkill(skill));
          }
        }}
      >
        <SkillIcon icon={skill.icon} />
        <span className="composer-add-menu-item-copy">
          <span className="composer-add-menu-item-title">
            <b>{skillName}</b>
            <span className="composer-add-menu-skill-actions">
              {skill.configured && (
                <UiTag
                  tone="muted"
                  className="composer-add-menu-skill-tag"
                >
                  {t("slashPalette.skill.source.agent")}
                </UiTag>
              )}
              <button
                type="button"
                className="composer-add-menu-skill-pin"
                aria-label={pinLabel}
                aria-pressed={pinned}
                title={pinLabel}
                disabled={pinsDisabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void toggleSkillPin(skill.id);
                }}
              >
                <MaterialIcon
                  name="push_pin"
                  className="composer-add-menu-skill-pin-icon"
                />
              </button>
            </span>
          </span>
          <small>
            {skill.description || t("slashPalette.skill.noDescription")}
          </small>
        </span>
      </div>
    );
  };
  const detailWidth = sectionMeta[section].detailWidth || DEFAULT_DETAIL_WIDTH;
  return (
    <div
      className="composer-add-menu-detail"
      data-section={section}
      onPointerDownCapture={section === "skills" ? props.onInteract : undefined}
      onFocusCapture={section === "skills" ? props.onInteract : undefined}
      onKeyDown={event => {
        if (section === "skills" && event.key === "Escape") {
          event.stopPropagation();
          props.onClose();
        }
      }}
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
      {section === "skills" && <SkillKindFilters value={kindFilter} onChange={setKindFilter}
        packageCount={filteredPackages.length} standaloneCount={filteredSkills.length} />}
      {section === "connectors" && (
        <AgentConnectorPicker
          key={props.currentAgentKey}
          agentKey={props.currentAgentKey}
          search={search}
          onSearchChange={onSearchChange}
          disabled={props.disabled}
        />
      )}
      {section === "files" && (
        <>
          {item(
            <>
              <MaterialIcon name="folder" />
              <span>{t("composer.addMenu.file")}</span>
            </>,
            props.onOpenFilePicker,
          )}

        </>
      )}
      {section === "skills" && (
        <div className="composer-add-menu-scroll">
          {pinError && skillQuery.status !== "error" && (
            <div
              className="composer-add-menu-status"
              role="alert"
              title={pinError.message}
            >
              {t("composer.addMenu.skill.pinFailed")}
              <UiButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  void refreshPins().catch(() => undefined);
                }}
              >
                {t("slashPalette.skills.retry")}
              </UiButton>
            </div>
          )}
          {catalogItems.map(item => item.kind === "package"
            ? <PackageSkillTree key={`package:${item.id}`} pkg={item.pkg} skills={skills}
              pinned={pinnedSkillIds.includes(skillIdentity(item.pkg.id))} pinsDisabled={pinsDisabled}
              onTogglePin={packageId => { void toggleSkillPin(packageId); }}
              selectedKeys={props.selectedSkillIds} selectedPackageId={props.selectedPackageId} lockedKeys={props.lockedSkillIds} search={search}
              disabled={props.disabled || props.isMainChatRunning || !props.onSelectSkills}
              onSelect={(members, selected, packageId) => execute(() => props.onSelectSkills?.(members, selected, packageId))} />
            : renderSkill(item.skill))}
          {skillQuery.status === "loading" && (
            <div className="composer-add-menu-status">
              {t("slashPalette.skills.loading")}
            </div>
          )}
          {skillQuery.status === "error" && (
            <div
              className="composer-add-menu-status"
              title={skillQuery.error?.message}
              role="alert"
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
          {skillQuery.status === "success" && !skills.length && !packages.length && (
            <div className="composer-add-menu-status">
              {t("slashPalette.skills.empty")}
            </div>
          )}
          {skillQuery.status === "success" &&
            (skills.length > 0 || packages.length > 0) &&
            !catalogItems.length && (
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
  const skillPickerInteracting = useRef(false);
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 560,
  );
  useEffect(() => {
    const updateCompact = () => setCompact(window.innerWidth < 560);
    window.addEventListener("resize", updateCompact);
    return () => window.removeEventListener("resize", updateCompact);
  }, []);
  // 切换面板时重置搜索词，与原先面板销毁重建的行为保持一致
  useEffect(() => {
    setSearch("");
    skillPickerInteracting.current = false;
  }, [section]);
  // mode / site 在不可用时跳过，分割线条目保持原位
  const navEntries = sectionNav.filter((entry) => {
    if (
      entry === "files" &&
      props.interactionConfig?.attachment.localFiles === false
    )
      return false;
    if (
      entry === "chat" &&
      props.interactionConfig?.attachment.chatRecords === false
    )
      return false;
    if (
      entry === "skills" &&
      (!props.currentAgentKey ||
        props.interactionConfig?.mustUseSkills === false)
    )
      return false;
    if (
      entry === "connectors" &&
      (!props.currentAgentKey || props.interactionConfig?.connectors === false)
    )
      return false;
    if (entry === "screenshot")
      return props.canCaptureDesktopScreenshot &&
        props.interactionConfig?.attachment.localFiles !== false;
    if (entry === "divider") return true;
    if (entry === "site") return canUseDesktopWebsBridge();
    if (entry === "mode")
      return props.canUsePlanningMode || props.canUseEditingMode;
    return true;
  });
  const visibleEntries = navEntries.filter(
    (entry, index) =>
      entry !== "divider" || (index > 0 && index < navEntries.length - 1),
  );
  useEffect(() => {
    if (section && !navEntries.includes(section)) setSection(null);
  }, [section, navEntries.join(",")]);
  // A side-by-side submenu cannot fit narrow chat windows. Reuse the parent
  // popover for this picker so the search and switches stay within the viewport.
  if (compact && section === "connectors") {
    return (
      <div>
        <UiButton
          variant="ghost"
          size="sm"
          className="composer-add-menu-detail-item"
          onClick={() => setSection(null)}
        >
          <MaterialIcon name="chevron_left" />
          {t("composer.addMenu.connectors.back")}
        </UiButton>
        <AddMenuSectionDetail
          {...props}
          section="connectors"
          onClose={props.onClose}
          search={search}
          onSearchChange={setSearch}
        />
      </div>
    );
  }
  return (
    <div className="composer-add-menu-nav" role="menu">
      {visibleEntries.map((entry, index) =>
        entry === "divider" ? (
          <div
            key={`divider-${index}`}
            className="composer-add-menu-divider"
            aria-hidden="true"
          />
        ) : entry === "screenshot" ? (
          <UiButton
            key={entry}
            variant="ghost"
            size="sm"
            role="menuitem"
            className="composer-add-menu-nav-item"
            disabled={props.disabled || props.isMainChatRunning || props.isCapturingDesktopScreenshot}
            loading={props.isCapturingDesktopScreenshot}
            title={props.screenshotDisabledReason}
            onMouseEnter={() => setSection(null)}
            onFocus={() => setSection(null)}
            onClick={() => {
              props.onCaptureScreenshot();
              props.onClose();
            }}
          >
            <MaterialIcon name="crop_free" />
            <span>{t("composer.addMenu.screenshot")}</span>
          </UiButton>
        ) : entry === "mode" ? (
          <UiButton
            key={entry}
            variant="ghost"
            size="sm"
            role="menuitemcheckbox"
            aria-checked={
              props.canUsePlanningMode ? props.planningMode : props.editingMode
            }
            className="composer-add-menu-nav-item"
            onMouseEnter={() => setSection(null)}
            onFocus={() => setSection(null)}
            onClick={() => {
              if (props.canUsePlanningMode) props.onTogglePlanningMode();
              else props.onEditingModeChange(!props.editingMode);
              props.onClose();
            }}
          >
            <MaterialIcon name="checklist" />
            <span>
              {t(
                props.canUsePlanningMode
                  ? "composer.addMenu.mode.planning"
                  : "composer.addMenu.mode.editing",
              )}
            </span>
            <span
              className="composer-add-menu-mode-switch"
              aria-hidden="true"
            />
          </UiButton>
        ) : (
          <Popover
            key={entry}
            open={section === entry}
            onOpenChange={(next) => {
              // Keep an interactive picker open until selection, Escape, another
              // section or the outer click-away closes it. Filtering must not
              // turn popup realignment into a mouse-leave dismissal.
              if (!next && (search.trim() || (entry === "skills" && skillPickerInteracting.current))) return;
              setSection((prev) =>
                next ? entry : prev === entry ? null : prev,
              );
            }}
            trigger={["hover", "click"]}
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
                onInteract={() => { skillPickerInteracting.current = true; }}
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
  // 切换 chat/agent 会改变整壳布局（空会话与会话的 grid 行结构不同），
  // 挂在 body 的 Popover 不会跟随 trigger 按钮重新对齐；且旧菜单数据
  // （chat 列表、技能、连接器）按原 chat/agent 请求，切换后直接关闭。
  useEffect(() => {
    setOpen(false);
  }, [props.currentChatId, props.currentAgentKey]);
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
        <SkinVisual slot="chat.attach">
          <MaterialIcon name="add" />
        </SkinVisual>
      </UiButton>
    </Popover>
  );
};
