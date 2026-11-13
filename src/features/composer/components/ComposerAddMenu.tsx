import pickerTypography from "@/shared/ui/PickerTypography.module.css";
import { bindCssModuleClasses } from "@/shared/utils/cssModuleClasses";
import composerPresentation from "@/features/composer/components/ComposerPresentation.module.css";
import { skillDisplayName, skillPackageDisplayName } from "@/shared/utils/skillDisplayName";
import { SkinVisual } from "@/shared/ui/SkinVisual";
import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { Input, Popover } from "antd";
import { useChatReferenceCandidates } from "@/features/chats/hooks/useChatReferenceCandidates";
import { CHAT_REFERENCE_LIMIT } from "@/features/chats/lib/chatReferenceCandidates";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { readEpochMillis } from "@/shared/utils/platformTime";
import type { ComposerContextReferenceInput } from "@/features/composer/lib/composerAttachments";
import type { AgentSkill } from "@/shared/data";
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
const presentationClasses = bindCssModuleClasses({ ...composerPresentation });


import { KBasePicker } from "@/features/kbases/components/KBasePicker";
import type { KBaseCatalog } from "@/features/kbases/hooks/useKBaseOptions";
import type { SelectedKBase } from "@/features/kbases/lib/kbasesState";

type Section = "kbases" | "files" | "skills" | "connectors" | "chat";
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
  referenceSelectionDisabled?: boolean;
  canCaptureDesktopScreenshot: boolean;
  isCapturingDesktopScreenshot: boolean;
  selectedSkillIds: string[];
  kbaseCatalog?: KBaseCatalog;
  selectedKbases?: SelectedKBase[];
  onSelectKbases?: (items: SelectedKBase[]) => void;
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
  kbases: { icon: "book_2", key: "kbase.title", detailWidth: 320 },
  files: { icon: "attach_file", key: "composer.addMenu.section.files" },
  skills: {
    icon: "bolt",
    key: "composer.addMenu.section.skills",
    detailWidth: 320,
  },
  connectors: {
    icon: "power_2",
    key: "composer.addMenu.section.connectors",
    detailWidth: 240,
  },
  chat: {
    icon: "question_answer",
    key: "composer.addMenu.section.chat",
    detailWidth: 320,
  },
};
// 一级面板导航条目："divider" 为分割线，可自由插入任意位置
type NavEntry = Section | "screenshot" | "planning" | "editing" | "divider";
const sectionNav: NavEntry[] = [
  "files",
  "screenshot",
  "divider",
  "planning",
  "editing",
  "skills",
  "connectors",
  "kbases",
  "chat",
];
const DEFAULT_DETAIL_WIDTH = 200;
// 一级导航宽度；二级面板沿用 sectionMeta.detailWidth。
const NAV_WIDTH = 200;
// 并排模式下两个浮层之间的最小间隙。
const SPLIT_GAP = 8;
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const searchPlaceholderKey: Partial<Record<Section, string>> = {
  skills: "composer.addMenu.search.skills",
  chat: "composer.addMenu.chat.search",
};

const CHAT_TITLE_SCROLL_PIXELS_PER_SECOND = 35;

// 对话标题：溢出时不显示省略号，右侧由日期遮盖；hover 时滚动展示完整内容。
const ChatTitle: React.FC<{ title: string }> = ({ title }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const content = textRef.current;
    if (!container || !content) return;
    const measure = () => setOverflow(
      container.clientWidth > 0
        ? Math.max(0, content.scrollWidth - container.clientWidth)
        : 0,
    );
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [title]);

  return (
    <span
      ref={containerRef}
      className={presentationClasses("composer-add-menu-chat-title")}
      data-overflow={overflow > 0 ? "true" : undefined}
      title={title}
      style={{
        "--chat-title-offset": `${-overflow}px`,
        "--chat-title-duration": `${overflow / CHAT_TITLE_SCROLL_PIXELS_PER_SECOND}s`,
      } as CSSProperties}
    >
      <span
        ref={textRef}
        className={`${presentationClasses("composer-add-menu-chat-title-text")} ${pickerTypography.name}`}
      >
        {title}
      </span>
    </span>
  );
};

const AddMenuSectionDetail: React.FC<
  AddMenuTriggerProps & {
    section: Section;
    onClose: () => void;
    search: string;
    onSearchChange: (value: string) => void;
    /** 二级面板是独立浮层时，用 Esc 收起它而不是关闭整个菜单。 */
    onEscape?: () => void;
    autoFocus?: boolean;
    onAutoFocusConsumed?: () => void;
  }
> = (props) => {
  const { t, locale } = useI18n();
  const { section, search, onSearchChange } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.autoFocus) return;
    const root = rootRef.current;
    if (!root) return;
    const target =
      root.querySelector<HTMLElement>("input") ||
      root.querySelector<HTMLElement>(".composer-add-menu-detail-item");
    target?.focus();
    props.onAutoFocusConsumed?.();
  }, [props.autoFocus]);
  const [kindFilter, setKindFilter] = useState<SkillKindFilter>(null);
  // Selection affects candidate order when opening, not while browsing this menu.
  const [selectedSkillIdsAtOpen] = useState(() => new Set(props.selectedSkillIds.map(skillIdentity)));
  const selectedSkillIds = new Set(props.selectedSkillIds.map(skillIdentity));
  const [searchComposing, setSearchComposing] = useState(false);
  const chatCandidates = useChatReferenceCandidates({
    enabled: section === "chat",
    agentKey: props.currentAgentKey,
    currentChatId: props.currentChatId,
    query: search,
    composing: searchComposing,
  });
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
    ...filteredPackages.map(pkg => ({ kind: "package" as const, id: pkg.id, label: skillPackageDisplayName(pkg), pkg,
      selectedAtOpen: packageMembers(pkg, skills).some(skill => selectedSkillIdsAtOpen.has(skillIdentity(skill.id))) })),
    ...filteredSkills.map(skill => ({ kind: "standalone" as const, id: skill.id, label: skillDisplayName(skill), skill,
      selectedAtOpen: selectedSkillIdsAtOpen.has(skillIdentity(skill.id)) })),
  ], pinnedSkillIds, locale)
    .sort((a, b) => Number(b.selectedAtOpen) - Number(a.selectedAtOpen))
    .filter(item => !kindFilter || item.kind === kindFilter);
  const execute = (action: () => void) => {
    action();
    props.onClose();
  };
  const item = (
    content: React.ReactNode,
    action: () => void,
    options: { key?: React.Key; disabled?: boolean; loading?: boolean; title?: string } = {},
  ) => (
    <UiButton
      key={options.key}
      variant="ghost"
      size="sm"
      className={presentationClasses("composer-add-menu-detail-item")}
      loading={options.loading}
      disabled={options.disabled || (["chat", "kbases"].includes(section) && props.referenceSelectionDisabled)}
      title={options.title}
      onClick={() => execute(action)}
    >
      {content}
    </UiButton>
  );
  const renderSkill = (skill: AgentSkill) => {
    const identity = text(skill.id).toLowerCase();
    const pinned = pinnedSkillIds.includes(identity);
    const selected = selectedSkillIds.has(identity);
    const skillName = skillDisplayName(skill);
    const pinLabel = t(
      pinned
        ? "composer.addMenu.skill.unpin"
        : "composer.addMenu.skill.pin",
      { name: skillName },
    );
    const selectDisabled = !!props.referenceSelectionDisabled;
    return (
      // 点击整行选择，置顶按钮独立操作。
      <div
        key={skill.id}
        className={presentationClasses(`composer-add-menu-skill-row composer-add-menu-skill-select${selectDisabled ? " is-disabled" : ""}`)}
        data-pinned={pinned || undefined}
        role="button"
        tabIndex={selectDisabled ? -1 : 0}
        aria-disabled={selectDisabled}
        aria-pressed={selected}
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
        <span className={presentationClasses("composer-add-menu-item-copy")}>
          <span className={presentationClasses("composer-add-menu-item-title")}>
            <b className={pickerTypography.name}>{skillName}</b>
            <span className={presentationClasses("composer-add-menu-skill-actions")}>
              {selected && <MaterialIcon name="check" className={presentationClasses("composer-add-menu-skill-selected")} />}
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
                className={presentationClasses("composer-add-menu-skill-pin")}
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
          <small className={pickerTypography.description}>
            {skill.description || t("slashPalette.skill.noDescription")}
          </small>
        </span>
      </div>
    );
  };
  return (
    <div
      ref={rootRef}
      className={presentationClasses("composer-add-menu-detail")}
      data-section={section}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !props.onEscape) return;
        event.preventDefault();
        event.stopPropagation();
        props.onEscape();
      }}
    >
      {searchable && (
        <Input
          className={pickerTypography.search}
          prefix={<MaterialIcon name="search" />}
          variant="filled"
          value={search}
          placeholder={t(searchPlaceholderKey[section] || "")}
          onChange={(event) => onSearchChange(event.target.value)}
          onCompositionStart={() => setSearchComposing(true)}
          onCompositionEnd={(event) => {
            setSearchComposing(false);
            onSearchChange(event.currentTarget.value);
          }}
          suffix={section === "skills" ? <SkillKindFilters value={kindFilter} onChange={setKindFilter}
            packageCount={filteredPackages.length} standaloneCount={filteredSkills.length} /> : undefined}
          style={{ marginBottom: 10 }}
        />
      )}
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
        <div className={presentationClasses("composer-add-menu-scroll")}>
          {pinError && skillQuery.status !== "error" && (
            <div
              className={presentationClasses("composer-add-menu-status")}
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
              disabled={props.disabled || props.referenceSelectionDisabled || !props.onSelectSkills}
              onSelect={(members, selected, packageId) => execute(() => props.onSelectSkills?.(members, selected, packageId))} />
            : renderSkill(item.skill))}
          {skillQuery.status === "loading" && (
            <div className={presentationClasses("composer-add-menu-status")}>
              {t("slashPalette.skills.loading")}
            </div>
          )}
          {skillQuery.status === "error" && (
            <div
              className={presentationClasses("composer-add-menu-status")}
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
            <div className={presentationClasses("composer-add-menu-status")}>
              {t("slashPalette.skills.empty")}
            </div>
          )}
          {skillQuery.status === "success" &&
            (skills.length > 0 || packages.length > 0) &&
            !catalogItems.length && (
              <div className={presentationClasses("composer-add-menu-status")}>
                {t("composer.addMenu.empty")}
              </div>
            )}
        </div>
      )}
      {section === "kbases" && props.kbaseCatalog && props.onSelectKbases && <KBasePicker disabled={props.referenceSelectionDisabled} catalog={props.kbaseCatalog} selected={props.selectedKbases || []} onChange={items => { if (!props.referenceSelectionDisabled) execute(() => { props.onSelectKbases?.(items); }); }} />}
      {section === "chat" && (
        <div className={presentationClasses("composer-add-menu-scroll")}>
          {chatCandidates.loading && (
            <div className={presentationClasses("composer-add-menu-status")}>
              {t(chatCandidates.searching ? "composer.addMenu.chat.searching" : "composer.addMenu.loading")}
            </div>
          )}
          {chatCandidates.error && (
            <div role="alert" className={presentationClasses("composer-add-menu-status")}>
              {t("composer.addMenu.chat.loadFailed")}
              <UiButton variant="ghost" size="mini" onClick={chatCandidates.retry}>
                {t("composer.addMenu.chat.retry")}
              </UiButton>
            </div>
          )}
          {!chatCandidates.loading && !chatCandidates.error && !chatCandidates.chats.length && (
            <div className={presentationClasses("composer-add-menu-status")}>
              {t(chatCandidates.searching ? "composer.addMenu.empty" : "composer.addMenu.chat.empty")}
            </div>
          )}
          {chatCandidates.chats.map((chat) => {
            const title = text(chat.chatName) || chat.chatId;
            return item(
              <>
                <MaterialIcon name="question_answer" />
                <ChatTitle title={title} />
                <small className={presentationClasses("composer-add-menu-chat-time")}>
                  {formatChatTimeLabel(readEpochMillis(chat.updatedAt))}
                </small>
              </>,
              () =>
                props.onAddReference({
                  type: "chat",
                  id: chat.chatId,
                  name: title,
                }),
              { key: chat.chatId },
            );
          })}
          {!chatCandidates.loading && chatCandidates.chats.length === CHAT_REFERENCE_LIMIT && (
            <div className={presentationClasses("composer-add-menu-status")}>
              {t(chatCandidates.searching ? "composer.addMenu.chat.searchHint" : "composer.addMenu.chat.previewHint")}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AddMenuPanel: React.FC<
  AddMenuTriggerProps & { onClose: () => void; maxWidth?: number }
> = (props) => {
  const { t } = useI18n();
  const [section, setSection] = useState<Section | null>(null);
  // 宽屏并排、窄屏逐级共用同一套面板内容。
  const [motion, setMotion] = useState<"forward" | "back">("forward");
  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const navItemRefs = useRef(new Map<Section, HTMLButtonElement | null>());
  const restoreFocusTo = useRef<Section | null>(null);
  const focusDetailRequest = useRef(false);
  const hoverTimer = useRef<number | undefined>(undefined);
  // 并排布局要求最宽的二级面板也能放在导航右侧；否则退回单栏逐级。
  const widestDetailWidth = sectionNav.reduce(
    (widest, entry) =>
      entry === "divider" || entry === "screenshot" || entry === "planning" || entry === "editing"
        ? widest
        : Math.max(widest, sectionMeta[entry].detailWidth || DEFAULT_DETAIL_WIDTH),
    DEFAULT_DETAIL_WIDTH,
  );
  const availableWidth =
    props.maxWidth ?? (typeof window === "undefined" ? 0 : window.innerWidth);
  // 二级面板是独立浮层，至少还要留出浮层之间的间距。
  const split = availableWidth >= NAV_WIDTH + widestDetailWidth + SPLIT_GAP;
  // 切换面板时重置搜索词，与原先面板销毁重建的行为保持一致
  useEffect(() => {
    setSearch("");
  }, [section]);
  // 返回一级时把焦点交还给原来的入口；单栏模式进入二级时把焦点交给搜索框。
  // 并排模式由二级面板自己处理自动聚焦，悬停预览不抢输入焦点。
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!section) {
      const target = restoreFocusTo.current
        ? navItemRefs.current.get(restoreFocusTo.current)
        : null;
      restoreFocusTo.current = null;
      if (!target) return;
      const timer = window.setTimeout(() => target.focus(), 0);
      return () => window.clearTimeout(timer);
    }
    if (split) return;
    const detail = panel.querySelector<HTMLElement>(".composer-add-menu-detail");
    const target =
      detail?.querySelector<HTMLElement>("input") ||
      detail?.querySelector<HTMLElement>(".composer-add-menu-detail-item") ||
      panel.querySelector<HTMLElement>(".composer-add-menu-back");
    if (!target) return;
    const timer = window.setTimeout(() => target.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [section, split]);
  useEffect(
    () => () => {
      window.clearTimeout(hoverTimer.current);
    },
    [],
  );
  // mode 在不可用时跳过，分割线条目保持原位
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
        props.interactionConfig?.attachment.skills === false)
    )
      return false;
    if (
      entry === "connectors" &&
      (!props.currentAgentKey || props.interactionConfig?.connectors === false)
    )
      return false;
    if (entry === "kbases") return !!props.kbaseCatalog && !!props.onSelectKbases;
    if (entry === "screenshot")
      return props.canCaptureDesktopScreenshot &&
        props.interactionConfig?.attachment.localFiles !== false;
    if (entry === "divider") return true;
    if (entry === "planning") return props.canUsePlanningMode;
    if (entry === "editing") return props.canUseEditingMode;
    return true;
  });
  const visibleEntries = navEntries.filter(
    (entry, index) =>
      entry !== "divider" || (index > 0 && index < navEntries.length - 1),
  );
  useEffect(() => {
    if (section && !navEntries.includes(section)) setSection(null);
  }, [section, navEntries.join(",")]);
  const openSection = (entry: Section) => {
    window.clearTimeout(hoverTimer.current);
    if (section === entry) {
      closeSection(entry);
      return;
    }
    focusDetailRequest.current = true;
    setMotion("forward");
    setSection(entry);
  };
  const closeSection = (entry: Section) => {
    restoreFocusTo.current = entry;
    focusDetailRequest.current = false;
    window.clearTimeout(hoverTimer.current);
    setMotion("back");
    setSection(null);
  };
  // 宽屏悬停预览：延迟一小段再展开，避免鼠标扫过时连续切换；不抢输入焦点。
  const previewSection = (entry: Section) => {
    if (!split) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setMotion("forward");
      setSection((current) => (current === entry ? current : entry));
    }, 120);
  };
  const cancelPreview = () => window.clearTimeout(hoverTimer.current);
  const backToNav = () => {
    if (section) closeSection(section);
    else props.onClose();
  };
  const panelWidth = section && !split
    ? sectionMeta[section].detailWidth || DEFAULT_DETAIL_WIDTH
    : NAV_WIDTH;
  const detailFor = (entry: Section, autoFocus: boolean) => (
    <AddMenuSectionDetail
      {...props}
      section={entry}
      onClose={props.onClose}
      search={search}
      onSearchChange={setSearch}
      onEscape={() => closeSection(entry)}
      autoFocus={autoFocus}
      onAutoFocusConsumed={() => {
        focusDetailRequest.current = false;
      }}
    />
  );
  const sectionWidthFor = (entry: Section) => {
    const preferred = sectionMeta[entry].detailWidth || DEFAULT_DETAIL_WIDTH;
    // 独立浮层不能超出触发器右侧的可用空间。
    return Math.max(DEFAULT_DETAIL_WIDTH, Math.min(preferred, availableWidth - NAV_WIDTH - SPLIT_GAP));
  };
  const navItem = (entry: Section) => {
    const button = (
      <UiButton
        ref={(node) => {
          navItemRefs.current.set(entry, node);
        }}
        variant="ghost"
        size="sm"
        role="menuitem"
        aria-expanded={split ? section === entry : undefined}
        className={presentationClasses(
          `composer-add-menu-nav-item${split && section === entry ? " is-active" : ""}`,
        )}
        onMouseEnter={() => previewSection(entry)}
        onMouseLeave={cancelPreview}
        onFocus={cancelPreview}
        onClick={split ? undefined : () => openSection(entry)}
      >
        <MaterialIcon name={sectionMeta[entry].icon} />
        <span>{t(sectionMeta[entry].key)}</span>
        <MaterialIcon name="keyboard_arrow_right" />
      </UiButton>
    );
    if (!split) return button;
    return (
      <Popover
        key={entry}
        open={section === entry}
        onOpenChange={(next) => {
          if (next) openSection(entry);
          else if (section === entry) closeSection(entry);
        }}
        trigger="click"
        placement="rightBottom"
        arrow={false}
        destroyOnHidden
        classNames={{ root: presentationClasses("composer-add-menu-overlay") }}
        align={{ overflow: { adjustX: true, adjustY: true } }}
        content={
          <div
            className={presentationClasses("composer-add-menu-side")}
            data-section={entry}
            role="group"
            aria-label={t(sectionMeta[entry].key)}
            style={
              {
                "--composer-add-menu-side-width": `${sectionWidthFor(entry)}px`,
              } as CSSProperties
            }
          >
            {detailFor(entry, focusDetailRequest.current)}
          </div>
        }
      >
        {button}
      </Popover>
    );
  };
  const nav = (
    <div
      className={presentationClasses("composer-add-menu-nav")}
      role="menu"
      aria-label={t("composer.addMenu.open")}
    >
      {visibleEntries.map((entry, index) =>
        entry === "divider" ? (
          <div
            key={`divider-${index}`}
            className={presentationClasses("composer-add-menu-divider")}
            aria-hidden="true"
          />
        ) : entry === "screenshot" ? (
          <UiButton
            key={entry}
            variant="ghost"
            size="sm"
            role="menuitem"
            className={presentationClasses("composer-add-menu-nav-item")}
            disabled={props.disabled || props.isMainChatRunning || props.isCapturingDesktopScreenshot}
            loading={props.isCapturingDesktopScreenshot}
            title={props.screenshotDisabledReason}
            onClick={() => {
              props.onCaptureScreenshot();
              props.onClose();
            }}
          >
            <MaterialIcon name="crop_free" />
            <span>{t("composer.addMenu.screenshot")}</span>
          </UiButton>
        ) : entry === "planning" || entry === "editing" ? (
          <UiButton
            key={entry}
            variant="ghost"
            size="sm"
            role="menuitemcheckbox"
            aria-checked={
              entry === "planning" ? props.planningMode : props.editingMode
            }
            className={presentationClasses("composer-add-menu-nav-item")}
            onClick={() => {
              if (entry === "planning") props.onTogglePlanningMode();
              else props.onEditingModeChange(!props.editingMode);
              props.onClose();
            }}
          >
            <MaterialIcon name="checklist" />
            <span>
              {t(
                entry === "planning"
                  ? "composer.addMenu.mode.planning"
                  : "composer.addMenu.mode.editing",
              )}
            </span>
            <span
              className={presentationClasses("composer-add-menu-mode-switch")}
              aria-hidden="true"
            />
          </UiButton>
        ) : (
          navItem(entry)
        ),
      )}
    </div>
  );
  return (
    <div
      ref={panelRef}
      className={presentationClasses("composer-add-menu-panel")}
      data-composer-add-menu=""
      data-layout={split ? "split" : "stacked"}
      data-view={section ? (split ? "split" : "detail") : "nav"}
      data-section={section || undefined}
      data-motion={motion}
      style={
        {
          "--composer-add-menu-width": `${panelWidth}px`,
          // 以触发器为锚点测量可用宽度，避免宽面板在窄窗里把浮层顶出视口。
          "--composer-add-menu-max-width": props.maxWidth ? `${props.maxWidth}px` : "100vw",
        } as CSSProperties
      }
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (!section) {
          props.onClose();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        closeSection(section);
      }}
    >
      {section && !split ? (
        <div
          key={section}
          className={presentationClasses("composer-add-menu-view")}
          role="dialog"
          aria-label={t(sectionMeta[section].key)}
        >
          <div className={presentationClasses("composer-add-menu-header")}>
            <UiButton
              variant="ghost"
              size="sm"
              className={presentationClasses("composer-add-menu-back")}
              aria-label={t("composer.addMenu.back")}
              onClick={backToNav}
            >
              <MaterialIcon name="chevron_left" />
              <span>{t(sectionMeta[section].key)}</span>
            </UiButton>
          </div>
          {detailFor(section, false)}
        </div>
      ) : (
        nav
      )}
    </div>
  );
};

export const AddMenuTrigger: React.FC<AddMenuTriggerProps> = (props) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [menuMaxWidth, setMenuMaxWidth] = useState<number | undefined>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const measureMenuMaxWidth = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuMaxWidth(Math.max(180, Math.floor(window.innerWidth - rect.left - 12)));
  };
  useEffect(() => {
    if (!open) return;
    measureMenuMaxWidth();
    window.addEventListener("resize", measureMenuMaxWidth);
    return () => window.removeEventListener("resize", measureMenuMaxWidth);
  }, [open]);
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
      align={{ overflow: { adjustX: true, adjustY: true, shiftY: true } }}
      arrow={false}
      destroyOnHidden
      classNames={{ root: presentationClasses("composer-add-menu-overlay") }}
      content={<AddMenuPanel {...props} onClose={() => setOpen(false)} maxWidth={menuMaxWidth} />}
    >
      <UiButton
        ref={triggerRef}
        onClick={measureMenuMaxWidth}
        className={presentationClasses(`composer-plus-btn tw:!grid tw:!h-8 tw:!min-h-8 tw:!w-8 tw:!min-w-8 tw:!place-items-center tw:!rounded-lg tw:!border-0 tw:!p-0 tw:!text-ink-2 tw:hover:!bg-bg-hover ${open ? "is-open" : ""}`)}
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
