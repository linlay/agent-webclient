import { focusEditableField } from "@/shared/ui/EditMenuButton";
import { CreateMenuButton } from "@/shared/ui/CreateMenuButton";
import { useResourceAssistant } from "@/features/resource-assistant/hooks/useResourceAssistant";
import { App as AntdApp } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Dropdown,
  Flex,
  Input,
  Modal,
  notification,
  Spin,
  Tabs,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import {
  createAdminSkillFile,
  createAdminSkill,
  deleteAdminSkillFile,
  downloadAdminSkill,
  downloadAdminSkillFile,
  fetchAdminSkillFileBlob,
  fetchAdminSkillIcon,
  getAdminSkillDetail,
  getAdminSource,
  getAdminSkills,
  importAdminSkill,
  mkdirAdminSkillFile,
  renameAdminSkillFile,
  updateAdminSource,
  uploadAdminSkillFile,
  validateAdminSkill,
} from "@/shared/data";
import type {
  AdminSkillStatus,
  AdminSkillDetailResponse,
  AdminSkillFileEntry,
  AdminSkillMutationResponse,
  AdminSkillSummary,
  AdminSkillTextFile,
  AdminSourceResponse,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { FileIcon } from "@/shared/components/file-icon";
import { CodeEditor } from "@/shared/ui/CodeEditor";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { usePinnedSkills } from "@/features/skills/hooks/usePinnedSkills";
import { sortPinnedItems } from "@/features/catalog-order/lib/pinnedOrder";
import { requestSkillDeletion } from "@/features/skills/lib/skillDeletion";
import { useOptionalAppContext } from "@/app/state/AppContext";
import { usePanelResize } from "@/shared/ui/usePanelResize";
import "./SkillConsole.module.css";

type StatusFilter = "all" | AdminSkillStatus;

function adminSourceToSkillTextFile(
  source: AdminSourceResponse,
): AdminSkillTextFile {
  return {
    key: source.target.key || "",
    path: source.target.path || "",
    content: source.content,
    encoding: source.encoding,
    sha256: source.sha256,
    size: source.size,
    updatedAt: source.updatedAt,
    editable: true,
  };
}

function translateWithFallback(
  t: (key: string) => string,
  key: string,
  fallback: string,
): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

const STATUS_FILTERS: StatusFilter[] = ["all", "ready", "invalid", "disabled"];

export const DEFAULT_SKILL_ICON_URL = "/default-skill.png";

export function fallbackSkillIcon(target: HTMLImageElement): void {
  target.onerror = null;
  target.src = DEFAULT_SKILL_ICON_URL;
}

const SkillListIcon: React.FC<{ icon?: string }> = ({ icon }) => {
  const [src, setSrc] = useState(DEFAULT_SKILL_ICON_URL);
  const iconURL = String(icon || "").trim();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let objectURL = "";
    setSrc(DEFAULT_SKILL_ICON_URL);
    if (
      !iconURL ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      return () => controller.abort();
    }
    void fetchAdminSkillIcon(iconURL, { signal: controller.signal })
      .then((blob) => {
        if (!active) return;
        objectURL = URL.createObjectURL(blob);
        setSrc(objectURL);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setSrc(DEFAULT_SKILL_ICON_URL);
        }
      });
    return () => {
      active = false;
      controller.abort();
      if (objectURL && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectURL);
      }
    };
  }, [iconURL]);

  return (
    <img
      className={SKILL_LIST_ITEM_ICON_CLASS_NAME}
      src={src}
      alt=""
      onError={(event) => fallbackSkillIcon(event.currentTarget)}
    />
  );
};

const SKILL_IMAGE_EXTENSION_PATTERN =
  /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;

export function isSkillImageEntry(entry: AdminSkillFileEntry): boolean {
  if (entry.kind !== "file" || entry.contentKind !== "binary") return false;
  const mimeType = String(entry.mimeType || "")
    .trim()
    .toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  return SKILL_IMAGE_EXTENSION_PATTERN.test(entry.path);
}

type SkillBinaryPreviewState =
  | { status: "loading" }
  | { status: "ready"; objectUrl: string }
  | { status: "error" };

export const SkillBinaryImagePreview: React.FC<{
  skillKey: string;
  entry: AdminSkillFileEntry;
  t: SkillConsoleTranslate;
}> = ({ skillKey, entry, t }) => {
  const [state, setState] = useState<SkillBinaryPreviewState>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let objectUrl = "";
    setState({ status: "loading" });
    if (
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      setState({ status: "error" });
      return () => controller.abort();
    }
    void fetchAdminSkillFileBlob(skillKey, entry.path, {
      signal: controller.signal,
    })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "ready", objectUrl });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setState({ status: "error" });
        }
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [skillKey, entry.path, entry.sha256]);

  if (state.status === "loading") {
    return (
      <div className={SKILL_BINARY_PREVIEW_LOADING_CLASS_NAME}>
        <Spin size="small" />
        <span>{t("skillConsole.binary.previewLoading")}</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className={SKILL_BINARY_PREVIEW_ERROR_CLASS_NAME}>
        {t("skillConsole.binary.previewFailed")}
      </div>
    );
  }
  return (
    <div className={SKILL_BINARY_PREVIEW_CLASS_NAME}>
      <img
        className={SKILL_BINARY_PREVIEW_IMG_CLASS_NAME}
        src={state.objectUrl}
        alt={entry.name}
        onError={() => setState({ status: "error" })}
      />
    </div>
  );
};

/* ---- class names ---- */
const SKILL_CONSOLE_CLASS_NAME =
  "skill-console tw:flex tw:flex-auto tw:flex-col tw:min-h-0 tw:gap-3 tw:overflow-hidden";
const SKILL_BODY_CLASS_NAME =
  "skill-console-body tw:grid tw:min-h-0 tw:flex-auto tw:grid-cols-[var(--skill-list-col,260px)_minmax(0,1fr)] tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";
const SKILL_LIST_CLASS_NAME =
  "skill-console-list tw:relative tw:flex tw:min-h-0 tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:min-w-0 tw:max-[860px]:max-h-[260px] tw:border-r tw:border-line-soft";
const SKILL_RESIZE_HANDLE_CLASS_NAME = "skill-console-resize-handle";
const SKILL_TOOLBAR_CLASS_NAME =
  "skill-console-toolbar tw:grid tw:grid-cols-[minmax(0,1fr)_auto_auto] tw:items-center tw:gap-2 tw:p-[6px]";
const SKILL_LIST_SCROLL_CLASS_NAME =
  "skill-console-list-scroll tw:min-h-0 tw:flex-auto tw:overflow-auto";
const SKILL_LIST_ITEMS_CLASS_NAME =
  "skill-console-list-items tw:flex tw:flex-col";
const SKILL_LIST_ITEM_CLASS_NAME =
  "skill-console-list-item tw:flex tw:w-full tw:flex-col tw:gap-[3px] tw:rounded-none tw:border tw:!border-transparent tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:text-ink-1 tw:hover:bg-bg-hover tw:[&.is-active]:bg-[var(--bg-selected)] tw:[&.is-active]:text-[var(--nav-selected-text)]";
const SKILL_LIST_ITEM_HEAD_CLASS_NAME =
  "skill-console-list-item-head tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2 tw:[&_.ui-tag]:flex-none";
const SKILL_LIST_ITEM_ICON_CLASS_NAME =
  "skill-console-list-item-icon tw:h-7 tw:w-7 tw:flex-none tw:rounded-md tw:object-cover";
const SKILL_LIST_ITEM_TITLE_CLASS_NAME =
  "skill-console-list-item-title tw:inline-flex tw:flex-col tw:min-w-0 tw:flex-1 tw:items-baseline tw:overflow-hidden tw:whitespace-nowrap tw:[&>strong]:min-w-0 tw:[&>strong]:overflow-hidden tw:[&>strong]:text-ellipsis tw:[&>strong]:text-[13px] tw:[&>strong]:leading-[1.35]";
const SKILL_LIST_ITEM_META_CLASS_NAME =
  "skill-console-list-item-meta tw:text-[11px] tw:leading-[1.35] tw:text-ink-muted";
const SKILL_LIST_ITEM_WRAP_CLASS_NAME =
  "skill-console-list-item-wrap tw:group tw:relative tw:min-w-0";
const SKILL_LIST_ITEM_PINNED_CLASS_NAME =
  "skill-console-list-item-pinned tw:pointer-events-none tw:absolute tw:top-0 tw:left-0";
const SKILL_LIST_ITEM_MORE_CLASS_NAME =
  "skill-console-list-item-more tw:absolute tw:top-0 tw:right-0 tw:flex tw:h-full tw:w-10 tw:items-center tw:justify-center tw:rounded-[3px] tw:border-0 tw:bg-transparent tw:p-0 tw:text-ink-muted tw:opacity-0 tw:pointer-events-none tw:cursor-pointer tw:hover:bg-bg-hover tw:hover:text-ink-1 tw:group-hover:opacity-100 tw:group-hover:pointer-events-auto";
const SKILL_LIST_ITEM_STATUS_CLASS_NAME =
  "skill-console-list-item-status tw:flex-none tw:pointer-events-none";
const SKILL_LIST_ITEM_VERSION_CLASS_NAME =
  "skill-console-list-item-version tw:font-code tw:text-[10px] tw:leading-none tw:text-ink-muted";
const SKILL_COUNT_CLASS_NAME =
  "skill-console-count tw:text-xs tw:text-ink-muted tw:px-[6px]";
const SKILL_DETAIL_CLASS_NAME =
  "skill-console-detail tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:overflow-hidden tw:max-[860px]:overflow-visible";
const SKILL_DETAIL_ACTIONS_CLASS_NAME =
  "skill-console-detail-actions tw:flex tw:flex-wrap tw:items-center tw:gap-2";
const SKILL_FILE_TREE_ACTIONS_CLASS_NAME =
  "skill-console-file-tree-actions tw:flex tw:flex-none tw:flex-nowrap tw:items-center tw:gap-2";
const SKILL_FILE_PANELS_CLASS_NAME =
  "skill-console-file-panels tw:flex tw:h-full tw:min-h-0 tw:overflow-hidden tw:max-[860px]:flex-col tw:max-[860px]:overflow-auto";
const SKILL_FILE_TREE_PANEL_CLASS_NAME =
  "skill-console-file-tree-panel tw:relative tw:flex tw:min-h-0 tw:w-[var(--skill-file-tree-col,280px)] tw:flex-none tw:flex-col tw:overflow-hidden tw:max-[860px]:w-full tw:max-[860px]:max-h-[260px] tw:border-l tw:border-line-soft";
const SKILL_FILE_TREE_TOOLBAR_CLASS_NAME =
  "skill-console-file-tree-toolbar tw:flex tw:items-center tw:justify-between tw:gap-2 tw:[&_.ui-btn-label]:gap-1 tw:p-[10px]";
const SKILL_FILE_TREE_CLASS_NAME =
  "skill-console-file-tree tw:min-h-0 tw:flex-auto tw:overflow-auto";
const SKILL_FILE_EDITOR_CLASS_NAME =
  "skill-console-file-editor tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:max-[860px]:overflow-visible";
const SKILL_FILE_EDITOR_HEAD_CLASS_NAME =
  "skill-console-file-editor-head tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2 tw:text-[11px] tw:text-ink-muted tw:p-[10px]";
const SKILL_FILE_EDITOR_META_CLASS_NAME =
  "skill-console-file-editor-meta tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-2";
const SKILL_FILE_EDITOR_HEAD_PATH_CLASS_NAME =
  "skill-console-file-editor-head-path tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:font-code tw:text-ink-1";
const SKILL_EDITOR_CLASS_NAME =
  "skill-console-editor tw:min-h-[520px] tw:flex-auto tw:max-[860px]:min-h-80";
const SKILL_BINARY_PANEL_CLASS_NAME =
  "skill-console-binary-panel tw:flex tw:flex-col tw:gap-3 tw:p-3 tw:text-sm tw:text-ink-1";
const SKILL_BINARY_GRID_CLASS_NAME =
  "skill-console-binary-grid tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:gap-x-3 tw:gap-y-2 tw:text-xs tw:[&>span:nth-child(odd)]:text-ink-muted tw:[&>span:nth-child(even)]:min-w-0 tw:[&>span:nth-child(even)]:overflow-hidden tw:[&>span:nth-child(even)]:text-ellipsis tw:[&>span:nth-child(even)]:whitespace-nowrap";
const SKILL_DIRTY_CLASS_NAME =
  "skill-console-dirty tw:text-xs tw:text-accent-warn";
const SKILL_BINARY_PREVIEW_CLASS_NAME =
  "skill-console-binary-preview tw:flex tw:min-h-0 tw:items-center tw:justify-center tw:gap-2 tw:overflow-hidden tw:rounded-control tw:bg-bg-hover tw:p-2";
const SKILL_BINARY_PREVIEW_IMG_CLASS_NAME =
  "skill-console-binary-preview-img tw:max-h-[320px] tw:max-w-full tw:rounded-md tw:object-contain";
const SKILL_BINARY_PREVIEW_LOADING_CLASS_NAME =
  "skill-console-binary-preview-loading tw:flex tw:min-h-24 tw:items-center tw:justify-center tw:gap-2 tw:text-xs tw:text-ink-muted";
const SKILL_BINARY_PREVIEW_ERROR_CLASS_NAME =
  "skill-console-binary-preview-error tw:flex tw:min-h-24 tw:items-center tw:justify-center tw:gap-2 tw:text-xs tw:text-danger";

/* ---- helpers ---- */

function statusVisual(status: AdminSkillStatus): {
  dotColor: string;
  textClassName: string;
} {
  if (status === "invalid")
    return {
      dotColor: "var(--accent-danger)",
      textClassName: "tw:text-accent-danger",
    };
  if (status === "disabled")
    return { dotColor: "var(--ink-muted)", textClassName: "tw:text-ink-muted" };
  return { dotColor: "var(--ok)", textClassName: "tw:text-ink-2" };
}

export function skillVersionLabel(version?: string): string {
  const trimmed = String(version ?? "").trim();
  if (!trimmed) return "";
  return `v${trimmed}`;
}

export const SkillListItemStatus: React.FC<{
  status: AdminSkillStatus;
  statusLabel: string;
}> = ({ status, statusLabel }) => {
  const visual = statusVisual(status);
  return (
    <span
      className={`${SKILL_LIST_ITEM_STATUS_CLASS_NAME} tw:flex tw:items-center tw:gap-1`}
    >
      <span
        className="tw:inline-block tw:h-[6px] tw:w-[6px] tw:flex-none tw:rounded-full"
        style={{ backgroundColor: visual.dotColor }}
        aria-hidden
      />
      <span
        className={`tw:text-[10px] tw:leading-none tw:font-medium ${visual.textClassName}`}
      >
        {statusLabel}
      </span>
    </span>
  );
};

export const SkillListItemVersion: React.FC<{ version?: string }> = ({
  version,
}) => {
  const versionLabel = skillVersionLabel(version);
  if (!versionLabel) return null;
  return (
    <span className={SKILL_LIST_ITEM_VERSION_CLASS_NAME}>{versionLabel}</span>
  );
};

export const SkillListItemActions: React.FC<{
  item: AdminSkillSummary;
  pinned: boolean;
  busy: boolean;
  pinsDisabled: boolean;
  t: SkillConsoleTranslate;
  onTogglePin: (skillKey: string) => void;
  onValidateSkill: (skillKey: string) => void;
  onDownloadSkill: (skillKey: string) => void;
  onDeleteSkill: (item: AdminSkillSummary) => void;
  onEditSkill?: (item: AdminSkillSummary) => void;
  onEditSkillConversation?: (item: AdminSkillSummary) => void;
}> = ({
  item,
  pinned,
  busy,
  pinsDisabled,
  t,
  onTogglePin,
  onValidateSkill,
  onDownloadSkill,
  onDeleteSkill,
  onEditSkill,
  onEditSkillConversation,
}) => {
  const moreLabel = t("skillConsole.action.more");
  const menuItems: MenuProps["items"] = [
    ...(onEditSkill ? [{ key: "edit", icon: <MaterialIcon name="edit" />, label: t("resourceAssistant.directEdit"), disabled: busy }] : []),
    ...(onEditSkillConversation ? [{ key: "edit-conversation", icon: <MaterialIcon name="question_answer" />, label: t("resourceAssistant.conversationEdit"), disabled: busy }] : []),
    {
      key: "pin",
      className: "ui-icon-hover-24",
      icon: (
        <MaterialIcon name="push_pin" className="ui-icon-hover-24-target" />
      ),
      label: t(
        pinned ? "skillConsole.action.unpin" : "skillConsole.action.pin",
      ),
      disabled: pinsDisabled,
    },
    {
      key: "validate",
      className: "ui-icon-hover-24",
      icon: <MaterialIcon name="rule" className="ui-icon-hover-24-target" />,
      label: t("skillConsole.action.validateSkill"),
      disabled: busy,
    },
    {
      key: "download",
      className: "ui-icon-hover-24",
      icon: (
        <MaterialIcon name="download" className="ui-icon-hover-24-target" />
      ),
      label: t("skillConsole.action.downloadSkill"),
      disabled: busy,
    },
    { type: "divider" },
    {
      key: "delete",
      className: "ui-icon-hover-24",
      icon: <MaterialIcon name="delete" className="ui-icon-hover-24-target" />,
      label: t("skillConsole.action.deleteSkill"),
      danger: true,
      disabled: busy,
    },
  ];

  const onMenuClick: MenuProps["onClick"] = ({ domEvent, key }) => {
    domEvent.stopPropagation();
    if (key === "edit") {
      onEditSkill?.(item);
    } else if (key === "edit-conversation") {
      onEditSkillConversation?.(item);
    } else if (key === "pin") {
      onTogglePin(item.key);
    } else if (key === "validate") {
      onValidateSkill(item.key);
    } else if (key === "download") {
      onDownloadSkill(item.key);
    } else if (key === "delete") {
      onDeleteSkill(item);
    }
  };

  return (
    <Dropdown
      trigger={["click"]}
      menu={{ items: menuItems, onClick: onMenuClick }}
      getPopupContainer={(trigger) => trigger.parentElement || trigger}
    >
      <button
        type="button"
        className={SKILL_LIST_ITEM_MORE_CLASS_NAME}
        aria-label={moreLabel}
        title={moreLabel}
        aria-haspopup="menu"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => event.stopPropagation()}
        style={{
          background:
            "linear-gradient(to left, var(--bg-base) 40%, transparent)",
        }}
      >
        <MaterialIcon
          name="more_horiz"
          className="tw:h-[14px] tw:w-[14px] tw:text-[14px]"
        />
      </button>
    </Dropdown>
  );
};

function formatSize(value: number | undefined): string {
  if (value === undefined || value === null) return "--";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function languageLabel(entry: AdminSkillFileEntry | undefined): string {
  if (!entry) return "Plain Text";
  if (entry.language) {
    switch (entry.language) {
      case "markdown":
        return "Markdown";
      case "python":
        return "Python";
      case "typescript":
        return "TypeScript";
      case "javascript":
        return "JavaScript";
      case "json":
        return "JSON";
      case "yaml":
        return "YAML";
      case "shell":
        return "Shell";
      case "plain":
        return "Plain Text";
      default:
        return entry.language.toUpperCase();
    }
  }
  const ext = entry.path.split(".").pop()?.toLowerCase() || "";
  return ext ? ext.toUpperCase() : "Plain Text";
}

function monacoLanguage(
  entry: AdminSkillFileEntry | undefined,
  path: string,
): string | undefined {
  if (entry?.language && entry.language !== "plain") return entry.language;
  const ext = path.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "md":
    case "markdown":
      return "markdown";
    case "json":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "jsx":
      return "javascript";
    case "py":
      return "python";
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "html":
      return "html";
    case "css":
      return "css";
    case "xml":
      return "xml";
    case "sql":
      return "sql";
    default:
      return undefined;
  }
}

function isFilePathSafe(rawPath: string): boolean {
  const trimmed = rawPath.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return false;
  if (trimmed.includes("..")) return false;
  if (trimmed.includes("\\")) return false;
  return true;
}

function findEntryByPath(
  entries: AdminSkillFileEntry[],
  path: string,
): AdminSkillFileEntry | undefined {
  const normalizedPath = path.trim();
  if (!normalizedPath) return undefined;
  return entries.find((entry) => entry.path === normalizedPath);
}

function findFirstTextEntry(
  entries: AdminSkillFileEntry[],
): AdminSkillFileEntry | undefined {
  return entries.find(
    (entry) => entry.kind === "file" && entry.contentKind === "text",
  );
}

export function findPreferredSkillFileEntry(
  entries: AdminSkillFileEntry[],
  preferredPath = "",
  defaultOpenPath = "",
): AdminSkillFileEntry | undefined {
  const preferred = findEntryByPath(entries, preferredPath);
  if (preferred?.kind === "file") return preferred;
  const defaultEntry = findEntryByPath(entries, defaultOpenPath);
  if (defaultEntry?.kind === "file") return defaultEntry;
  return findEntryByPath(entries, "SKILL.md") || findFirstTextEntry(entries);
}

export function updateSkillDirtyFiles(
  current: Set<string>,
  path: string,
  content: string,
  originalContent: string,
): Set<string> {
  const normalizedPath = path.trim();
  const next = new Set(current);
  if (!normalizedPath || content === originalContent) {
    next.delete(normalizedPath);
    return next;
  }
  next.add(normalizedPath);
  return next;
}

export function toggleSkillExpandedDir(
  current: Set<string>,
  path: string,
): Set<string> {
  const normalizedPath = path.trim();
  const next = new Set(current);
  if (!normalizedPath) return next;
  if (next.has(normalizedPath)) {
    next.delete(normalizedPath);
  } else {
    next.add(normalizedPath);
  }
  return next;
}

export function isSkillEntryVisible(
  entry: AdminSkillFileEntry,
  expandedDirs: Set<string>,
): boolean {
  if (!entry.parentPath) return true;
  let current = entry.parentPath;
  while (current) {
    if (!expandedDirs.has(current)) return false;
    const index = current.lastIndexOf("/");
    current = index >= 0 ? current.slice(0, index) : "";
  }
  return true;
}

export function skillAnchorPath(
  entry: AdminSkillFileEntry | undefined,
): string {
  if (!entry) return "";
  if (entry.kind === "directory") return entry.path;
  return entry.parentPath || "";
}

export function skillSiblingPath(
  entry: AdminSkillFileEntry | undefined,
): string {
  if (!entry) return "";
  return entry.parentPath || "";
}

export function joinSkillPath(parent: string, name: string): string {
  const normalizedParent = parent.trim().replace(/\/+$/, "");
  const normalizedName = name.trim();
  if (!normalizedParent) return normalizedName;
  return `${normalizedParent}/${normalizedName}`;
}

export const SkillFileEntryIcon: React.FC<{
  entry: AdminSkillFileEntry;
  expanded?: boolean;
}> = ({ entry, expanded = false }) => {
  if (entry.kind === "directory") {
    return (
      <MaterialIcon
        name={expanded ? "folder_open_fill" : "folder_fill"}
        className="tw:text-yellow-400"
      />
    );
  }
  return <FileIcon filename={entry.name} size={20} />;
};

function applyOpenedFileState(
  file: AdminSkillTextFile,
  setSelectedFilePath: (value: string) => void,
  setFileContent: (value: string) => void,
  setOriginalFileContent: (value: string) => void,
  setFileSha256: (value: string | null) => void,
  setFileSize: (value: number | undefined) => void,
  setFileUpdatedAt: (value: number | undefined) => void,
  setDirtyFiles: Dispatch<SetStateAction<Set<string>>>,
): void {
  setSelectedFilePath(file.path);
  setFileContent(file.content);
  setOriginalFileContent(file.content);
  setFileSha256(file.sha256 || null);
  setFileSize(file.size);
  setFileUpdatedAt(file.updatedAt);
  setDirtyFiles((prev) => {
    const next = new Set(prev);
    next.delete(file.path);
    return next;
  });
}

function mergeDetailWithMutation(
  detail: AdminSkillDetailResponse,
  mutation: AdminSkillMutationResponse,
): AdminSkillDetailResponse {
  const fileManifest = mutation.fileManifest || detail.fileManifest;
  const entries =
    mutation.entry && !mutation.fileManifest
      ? fileManifest.entries.map((entry) =>
          entry.path === mutation.entry?.path ? mutation.entry : entry,
        )
      : fileManifest.entries;
  return {
    ...detail,
    skill: mutation.skill || detail.skill,
    diagnostics: mutation.diagnostics ?? detail.diagnostics,
    fileManifest: {
      ...fileManifest,
      entries,
    },
    openedFile: mutation.openedFile || detail.openedFile,
  };
}

type SkillConsoleTranslate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

type SkillCreateMode = "direct" | "zip";
type SkillKeyValidationCode = "" | "required" | "invalid" | "exists";
type SkillArchiveFileValidationCode = "" | "type" | "empty" | "size";

export const ADMIN_SKILL_IMPORT_MAX_BYTES = 512 * 1024 * 1024;

export interface SkillImportDiagnostic {
  severity?: string;
  code?: string;
  message: string;
  sourcePath?: string;
}

export function validateNewSkillKey(
  rawKey: string,
  existingKeys: readonly string[] = [],
): SkillKeyValidationCode {
  const key = rawKey.trim();
  if (!key) return "required";
  if (
    key !== rawKey ||
    key === "." ||
    key === ".." ||
    key.startsWith(".") ||
    key.toLowerCase().endsWith(".example") ||
    key.includes("/") ||
    key.includes("\\") ||
    key.includes("\0")
  ) {
    return "invalid";
  }
  if (
    existingKeys.some(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    )
  ) {
    return "exists";
  }
  return "";
}

export function validateSkillArchiveFile(
  file: Pick<File, "name" | "size"> | null,
): SkillArchiveFileValidationCode {
  if (!file || !file.name.toLowerCase().endsWith(".zip")) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > ADMIN_SKILL_IMPORT_MAX_BYTES) return "size";
  return "";
}

export function skillImportDiagnostics(
  error: unknown,
): SkillImportDiagnostic[] {
  const data = (error as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return [];
  const errorData = (data as { error?: unknown }).error;
  if (!errorData || typeof errorData !== "object") return [];
  const diagnostics = (errorData as { diagnostics?: unknown }).diagnostics;
  if (!Array.isArray(diagnostics)) return [];
  return diagnostics.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const diagnostic = item as Record<string, unknown>;
    const message = String(diagnostic.message || "").trim();
    if (!message) return [];
    return [
      {
        severity: String(diagnostic.severity || "").trim() || undefined,
        code: String(diagnostic.code || "").trim() || undefined,
        message,
        sourcePath: String(diagnostic.sourcePath || "").trim() || undefined,
      },
    ];
  });
}

interface SkillCreateModalProps {
  open: boolean;
  existingKeys: readonly string[];
  t: SkillConsoleTranslate;
  onCancel: () => void;
  onDirectCreate: (key: string, name: string) => Promise<boolean>;
  onZipImport: (key: string, file: File) => Promise<boolean>;
}

export const SkillCreateModal: React.FC<SkillCreateModalProps> = ({
  open,
  existingKeys,
  t,
  onCancel,
  onDirectCreate,
  onZipImport,
}) => {
  const [mode, setMode] = useState<SkillCreateMode>("zip");
  const [directKey, setDirectKey] = useState("");
  const [directName, setDirectName] = useState("");
  const [zipKey, setZipKey] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverKeyError, setServerKeyError] = useState("");
  const [diagnostics, setDiagnostics] = useState<SkillImportDiagnostic[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("zip");
    setDirectKey("");
    setDirectName("");
    setZipKey("");
    setZipFile(null);
    setKeyTouched(false);
    setDragActive(false);
    setSubmitting(false);
    setServerKeyError("");
    setDiagnostics([]);
  }, [open]);

  const currentKey = mode === "direct" ? directKey : zipKey;
  const keyValidation =
    mode === "direct"
      ? validateNewSkillKey(currentKey, existingKeys)
      : currentKey
        ? validateNewSkillKey(currentKey)
        : "";
  const keyError =
    serverKeyError ||
    (keyValidation && (keyTouched || Boolean(currentKey))
      ? t(`skillConsole.create.keyError.${keyValidation}`)
      : "");
  const canSubmit = !keyValidation && (mode === "direct" || Boolean(zipFile));

  const resetError = () => {
    setServerKeyError("");
    setDiagnostics([]);
  };

  const acceptArchive = (file: File | null) => {
    resetError();
    const validation = validateSkillArchiveFile(file);
    if (validation) {
      setZipFile(null);
      notification.error({
        message: t(`skillConsole.import.error.${validation}`),
      });
      return;
    }
    setZipFile(file as File);
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    resetError();
    setSubmitting(true);
    try {
      const key = currentKey.trim();
      const completed =
        mode === "direct"
          ? await onDirectCreate(key, directName.trim() || key)
          : await onZipImport(key, zipFile as File);
      if (!completed) return;
    } catch (error) {
      const importedDiagnostics = skillImportDiagnostics(error);
      setDiagnostics(importedDiagnostics);
      const status = (error as { status?: unknown } | null)?.status;
      if (status === 409 && mode === "direct") {
        setServerKeyError(t("skillConsole.import.error.exists"));
      } else {
        notification.error({
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const directContent = (
    <div className="tw:flex tw:flex-col tw:gap-4 tw:pt-1">
      <label
        className="tw:flex tw:flex-col tw:gap-1.5"
        htmlFor="skill-create-key"
      >
        <span className="tw:text-sm tw:font-medium tw:text-ink-1">
          {t("skillConsole.field.key")}
        </span>
        <Input
          id="skill-create-key"
          autoFocus={mode === "direct"}
          value={directKey}
          placeholder="skill-key"
          status={keyError ? "error" : undefined}
          aria-describedby={keyError ? "skill-create-key-error" : undefined}
          onChange={(event) => {
            setDirectKey(event.target.value);
            setKeyTouched(true);
            resetError();
          }}
          onPressEnter={() => void handleSubmit()}
        />
        {keyError && (
          <span
            id="skill-create-key-error"
            role="alert"
            className="tw:text-xs tw:text-danger"
          >
            {keyError}
          </span>
        )}
      </label>
      <label
        className="tw:flex tw:flex-col tw:gap-1.5"
        htmlFor="skill-create-name"
      >
        <span className="tw:text-sm tw:font-medium tw:text-ink-1">
          {t("skillConsole.field.name")}
        </span>
        <Input
          id="skill-create-name"
          value={directName}
          placeholder={t("skillConsole.create.namePlaceholder")}
          onChange={(event) => {
            setDirectName(event.target.value);
            resetError();
          }}
          onPressEnter={() => void handleSubmit()}
        />
      </label>
      <div className="tw:text-xs tw:leading-5 tw:text-ink-muted">
        {t("skillConsole.create.description")}
      </div>
    </div>
  );

  const zipContent = (
    <div className="tw:flex tw:flex-col tw:gap-4 tw:pt-1">
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="tw:hidden"
        aria-label={t("skillConsole.import.select")}
        onChange={(event) => {
          acceptArchive(event.target.files?.[0] || null);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        className={`tw:flex tw:min-h-36 tw:w-full tw:cursor-pointer tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-control tw:border tw:border-dashed tw:p-5 tw:text-center tw:transition-colors tw:focus-visible:outline tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:cursor-not-allowed ${
          dragActive
            ? "tw:border-accent tw:bg-accent-soft"
            : "tw:border-line-soft tw:bg-bg-subtle"
        }`}
        onClick={() => fileInputRef.current?.click()}
        disabled={submitting}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (submitting) return;
          acceptArchive(event.dataTransfer.files?.[0] || null);
        }}
      >
        <MaterialIcon name="folder_zip" />
        {zipFile ? (
          <>
            <strong className="tw:max-w-full tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-sm tw:text-ink-1">
              {zipFile.name}
            </strong>
            <span className="tw:text-xs tw:text-ink-muted">
              {formatSize(zipFile.size)}
            </span>
          </>
        ) : (
          <span className="tw:text-sm tw:text-ink-1">
            {t("skillConsole.import.drop")}
          </span>
        )}
      </button>
      <label
        className="tw:flex tw:flex-col tw:gap-1.5"
        htmlFor="skill-import-key"
      >
        <span className="tw:text-sm tw:font-medium tw:text-ink-1">
          {t("skillConsole.import.keyOptional")}
        </span>
        <Input
          id="skill-import-key"
          value={zipKey}
          disabled={submitting}
          placeholder={t("skillConsole.import.keyPlaceholder")}
          status={keyError ? "error" : undefined}
          aria-describedby={keyError ? "skill-import-key-error" : undefined}
          onChange={(event) => {
            setZipKey(event.target.value);
            setKeyTouched(true);
            resetError();
          }}
          onPressEnter={() => void handleSubmit()}
        />
        {keyError && (
          <span
            id="skill-import-key-error"
            role="alert"
            className="tw:text-xs tw:text-danger"
          >
            {keyError}
          </span>
        )}
      </label>
      <div className="tw:text-xs tw:leading-5 tw:text-ink-muted">
        {t("skillConsole.import.description")}
      </div>
      {submitting && (
        <div
          role="status"
          aria-live="polite"
          className="tw:text-xs tw:text-ink-muted"
        >
          {t("skillConsole.import.uploading")}
        </div>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      title={t("skillConsole.create.title")}
      width={560}
      destroyOnClose
      maskClosable={!submitting}
      keyboard={!submitting}
      okText={t(
        mode === "direct"
          ? "skillConsole.create.submit"
          : "skillConsole.import.submit",
      )}
      cancelText={t("skillConsole.action.cancel")}
      confirmLoading={submitting}
      okButtonProps={{ disabled: !canSubmit }}
      onCancel={() => {
        if (!submitting) onCancel();
      }}
      onOk={() => void handleSubmit()}
    >
      <Tabs
        activeKey={mode}
        onChange={(key) => {
          if (submitting) return;
          setMode(key as SkillCreateMode);
          setKeyTouched(false);
          resetError();
        }}
        items={[
          {
            key: "zip",
            label: t("skillConsole.create.mode.zip"),
            children: zipContent,
          },
          { key: "direct", label: t("skillConsole.create.mode.direct"), children: directContent },
        ]}
      />
      {diagnostics.length > 0 && (
        <ul className="tw:mt-3 tw:flex tw:list-disc tw:flex-col tw:gap-1 tw:pl-5 tw:text-xs tw:text-danger">
          {diagnostics.map((diagnostic, index) => (
            <li
              key={`${diagnostic.code || "diagnostic"}-${diagnostic.sourcePath || index}`}
            >
              {diagnostic.sourcePath ? `${diagnostic.sourcePath}: ` : ""}
              {diagnostic.message}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

interface SkillFileWorkspaceProps {
  detail: AdminSkillDetailResponse;
  selectedFilePath: string;
  fileContent: string;
  fileSize: number | undefined;
  fileSha256: string | null;
  dirtyFiles: Set<string>;
  expandedDirs: Set<string>;
  isFileDirty: boolean;
  saving: boolean;
  deletingSkill?: boolean;
  downloadingFile?: boolean;
  fileTreeOpen?: boolean;
  onToggleFileTree?: () => void;
  t: SkillConsoleTranslate;
  onCreateFile: () => void;
  onCreateDir: () => void;
  onCreateSubdir: () => void;
  onUploadFile: (file: File) => void;
  onDownloadEntry?: (entry: AdminSkillFileEntry) => void;
  onReplaceEntry?: (entry: AdminSkillFileEntry, file: File) => void;
  onRenameEntry?: (entry: AdminSkillFileEntry) => void;
  onDeleteEntry?: (entry: AdminSkillFileEntry) => void;
  onRefreshFile: () => void;
  onSave: () => void;
  onFileChange: (value: string) => void;
  onSelectFileEntry: (entry: AdminSkillFileEntry) => void | Promise<void>;
}

export const SkillFileWorkspace: React.FC<SkillFileWorkspaceProps> = ({
  detail,
  selectedFilePath,
  fileContent,
  fileSize,
  fileSha256,
  dirtyFiles,
  expandedDirs,
  isFileDirty,
  saving,
  deletingSkill = false,
  downloadingFile = false,
  fileTreeOpen = true,
  onToggleFileTree = () => {},
  t,
  onCreateFile,
  onCreateDir,
  onCreateSubdir,
  onUploadFile,
  onDownloadEntry,
  onReplaceEntry,
  onRenameEntry,
  onDeleteEntry,
  onRefreshFile,
  onSave,
  onFileChange,
  onSelectFileEntry,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<AdminSkillFileEntry | null>(null);
  const appContext = useOptionalAppContext();

  // 右侧文件树列宽；拖拽手柄在面板左缘，向左拖变宽
  const [fileTreeWidth, setFileTreeWidth] = useState(280);
  const fileTreeStartWidthRef = useRef(280);
  const { handlePointerDown: handleFileTreeResize } = usePanelResize({
    axis: "horizontal",
    invert: true,
    onResizeStart: () => {
      fileTreeStartWidthRef.current = fileTreeWidth;
    },
    onResize: (delta) =>
      setFileTreeWidth(
        Math.max(200, Math.min(520, fileTreeStartWidthRef.current + delta)),
      ),
  });
  const entries = detail.fileManifest.entries || [];
  const selectedEntry = findEntryByPath(entries, selectedFilePath);
  const visibleEntries = entries.filter((entry) =>
    isSkillEntryVisible(entry, expandedDirs),
  );
  const isTextSelected = selectedEntry?.contentKind === "text";
  const isBinarySelected = selectedEntry?.contentKind === "binary";
  const isDirSelected = selectedEntry?.contentKind === "directory";
  const interactionLocked = deletingSkill;

  const fileAddMenu: MenuProps = {
    onClick: (info) => {
      if (info.key === "upload") {
        uploadInputRef.current?.click();
      } else {
        onCreateFile();
      }
    },
    items: [
      {
        key: "upload",
        icon: <MaterialIcon name="upload" />,
        label: t("skillConsole.action.uploadFile"),
      },
      {
        key: "create",
        icon: <MaterialIcon name="description" />,
        label: t("skillConsole.action.createTextFile"),
      },
    ],
  };

  const dirAddMenu: MenuProps = {
    onClick: (info) => {
      if (info.key === "subdir") {
        onCreateSubdir();
      } else {
        onCreateDir();
      }
    },
    items: [
      {
        key: "dir",
        icon: <MaterialIcon name="create_new_folder" />,
        label: t("skillConsole.action.createDir"),
      },
      {
        key: "subdir",
        icon: <MaterialIcon name="folder" />,
        label: t("skillConsole.action.createSubdir"),
        disabled: selectedEntry?.kind !== "directory",
      },
    ],
  };

  return (
    <div className={SKILL_FILE_PANELS_CLASS_NAME}>
      <div className={SKILL_FILE_EDITOR_CLASS_NAME}>
        {selectedEntry ? (
          <>
            <div className={SKILL_FILE_EDITOR_HEAD_CLASS_NAME}>
              <div className={SKILL_FILE_EDITOR_META_CLASS_NAME}>
                <SkillFileEntryIcon
                  entry={selectedEntry}
                  expanded={expandedDirs.has(selectedEntry.path)}
                />
                <span className={SKILL_FILE_EDITOR_HEAD_PATH_CLASS_NAME}>
                  {selectedEntry.path}
                </span>
                <span>
                  {isDirSelected
                    ? t("skillConsole.fileTree.directory")
                    : isTextSelected
                      ? languageLabel(selectedEntry)
                      : selectedEntry.mimeType || "Binary"}
                </span>
                {fileSize !== undefined && <span>{formatSize(fileSize)}</span>}
              </div>
              <div className={SKILL_DETAIL_ACTIONS_CLASS_NAME}>
                {isFileDirty && (
                  <span className={SKILL_DIRTY_CLASS_NAME}>
                    {t("skillConsole.message.unsaved")}
                  </span>
                )}
                <UiButton
                  size="sm"
                  variant="ghost"
                  className="ui-icon-hover-24"
                  iconOnly
                  onClick={onRefreshFile}
                  disabled={saving || interactionLocked}
                  aria-label={t("skillConsole.action.refresh")}
                >
                  <MaterialIcon name="refresh" />
                </UiButton>
                {isTextSelected && isFileDirty && (
                  <UiButton
                    size="sm"
                    variant="ghost"
                    className="ui-icon-hover-24 tw:!text-accent"
                    iconOnly
                    onClick={onSave}
                    disabled={saving || !isFileDirty || interactionLocked}
                    aria-label={t("skillConsole.action.save")}
                  >
                    <MaterialIcon name="save" />
                  </UiButton>
                )}
                {!fileTreeOpen && (
                  <UiButton
                    size="sm"
                    variant="ghost"
                    className="ui-icon-hover-24"
                    iconOnly
                    onClick={onToggleFileTree}
                    aria-label={t("skillConsole.action.expandFileTree")}
                  >
                    <MaterialIcon name="dock_to_left" />
                  </UiButton>
                )}
              </div>
            </div>

            {isDirSelected ? (
              <div className={SKILL_BINARY_PANEL_CLASS_NAME}>
                <strong>{selectedEntry.name}</strong>
                <div className={SKILL_BINARY_GRID_CLASS_NAME}>
                  <span>{t("skillConsole.field.path")}</span>
                  <span>{selectedEntry.path}</span>
                  <span>{t("skillConsole.field.children")}</span>
                  <span>
                    {
                      entries.filter(
                        (entry) => entry.parentPath === selectedEntry.path,
                      ).length
                    }
                  </span>
                </div>
                <div className="tw:text-xs tw:text-ink-muted">
                  {t("skillConsole.fileTree.dirHint")}
                </div>
              </div>
            ) : isTextSelected ? (
              <CodeEditor
                className={SKILL_EDITOR_CLASS_NAME}
                value={fileContent}
                path={selectedFilePath || "untitled"}
                language={monacoLanguage(selectedEntry, selectedFilePath)}
                theme={
                  appContext?.state.themeMode === "dark" ? "dark" : "light"
                }
                disabled={interactionLocked}
                onChange={onFileChange}
              />
            ) : (
              <div className={SKILL_BINARY_PANEL_CLASS_NAME}>
                {isSkillImageEntry(selectedEntry) && (
                  <SkillBinaryImagePreview
                    skillKey={detail.skill.key}
                    entry={selectedEntry}
                    t={t}
                  />
                )}
                <strong>{selectedEntry.name}</strong>
                <div className={SKILL_BINARY_GRID_CLASS_NAME}>
                  <span>{t("skillConsole.field.path")}</span>
                  <span>{selectedEntry.path}</span>
                  <span>{t("skillConsole.field.size")}</span>
                  <span>{formatSize(selectedEntry.size)}</span>
                  <span>{t("skillConsole.field.mime")}</span>
                  <span>{selectedEntry.mimeType || "--"}</span>
                  <span>{t("skillConsole.field.sha256")}</span>
                  <span>{fileSha256 || selectedEntry.sha256 || "--"}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={SKILL_FILE_EDITOR_HEAD_CLASS_NAME}>
              {!fileTreeOpen && (
                <UiButton
                  size="sm"
                  variant="ghost"
                  className="ui-icon-hover-24"
                  iconOnly
                  onClick={onToggleFileTree}
                  aria-label={t("skillConsole.action.expandFileTree")}
                >
                  <MaterialIcon name="dock_to_left" />
                </UiButton>
              )}
            </div>
            <div className="command-empty-state">
              {t("skillConsole.fileTree.empty")}
            </div>
          </>
        )}
      </div>

      {fileTreeOpen ? (
        <div
          className={SKILL_FILE_TREE_PANEL_CLASS_NAME}
          style={
            {
              "--skill-file-tree-col": `${fileTreeWidth}px`,
            } as React.CSSProperties
          }
        >
          <button
            type="button"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("skillConsole.resize.fileTreeAriaLabel")}
            title={t("skillConsole.resize.fileTreeTitle")}
            className={SKILL_RESIZE_HANDLE_CLASS_NAME}
            style={{ left: -4 }}
            onPointerDown={handleFileTreeResize}
          />
          <div className={SKILL_FILE_TREE_TOOLBAR_CLASS_NAME}>
            <span className="tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:font-medium tw:text-ink-muted">
              {t("skillConsole.fileTree.root")}
            </span>
            <div className={SKILL_FILE_TREE_ACTIONS_CLASS_NAME}>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*,.pdf,.txt,.md,.json,.yaml,.yml,.csv,.zip"
                disabled={interactionLocked}
                className="tw:hidden"
                aria-label={t("skillConsole.action.uploadFile")}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) onUploadFile(file);
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                disabled={interactionLocked}
                className="tw:hidden"
                aria-label={t("skillConsole.action.replaceFile")}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file && replaceTargetRef.current) {
                    onReplaceEntry?.(replaceTargetRef.current, file);
                    replaceTargetRef.current = null;
                  }
                }}
              />
              <Dropdown
                menu={fileAddMenu}
                trigger={["click"]}
                placement="bottomLeft"
              >
                <UiButton
                  size="sm"
                  variant="ghost"
                  className="ui-icon-hover-24"
                  disabled={interactionLocked}
                  iconOnly
                  aria-label={t("skillConsole.action.addFile")}
                >
                  <MaterialIcon name="upload" />
                </UiButton>
              </Dropdown>
              <Dropdown
                menu={dirAddMenu}
                trigger={["click"]}
                placement="bottomLeft"
              >
                <UiButton
                  size="sm"
                  variant="ghost"
                  className="ui-icon-hover-24"
                  iconOnly
                  disabled={interactionLocked}
                  aria-label={t("skillConsole.action.createDir")}
                >
                  <MaterialIcon name="create_new_folder" />
                </UiButton>
              </Dropdown>
              <UiButton
                size="sm"
                variant="ghost"
                className="ui-icon-hover-24"
                iconOnly
                onClick={onToggleFileTree}
                aria-label={t("skillConsole.action.collapseFileTree")}
              >
                <MaterialIcon name="dock_to_right" />
              </UiButton>
            </div>
          </div>

          <div className={SKILL_FILE_TREE_CLASS_NAME}>
            {visibleEntries.length > 0 ? (
              visibleEntries.map((entry) => {
                const isSelected = entry.path === selectedFilePath;
                const isDirty = dirtyFiles.has(entry.path);
                const paddingLeft = 8 + entry.depth * 16;
                const moreLabel = t("skillConsole.action.more");
                const entryMenuItems: MenuProps["items"] = [
                  entry.downloadable
                    ? {
                        key: "download",
                        className: "ui-icon-hover-24",
                        icon: (
                          <MaterialIcon
                            name="download"
                            className="ui-icon-hover-24-target"
                          />
                        ),
                        label: t("skillConsole.action.download"),
                        disabled: downloadingFile || interactionLocked,
                      }
                    : null,
                  entry.uploadable && entry.contentKind === "binary"
                    ? {
                        key: "replace",
                        className: "ui-icon-hover-24",
                        icon: (
                          <MaterialIcon
                            name="article"
                            className="ui-icon-hover-24-target"
                          />
                        ),
                        label: t("skillConsole.action.replaceFile"),
                        disabled: interactionLocked,
                      }
                    : null,
                  entry.renamable
                    ? {
                        key: "rename",
                        className: "ui-icon-hover-24",
                        icon: (
                          <MaterialIcon
                            name="rename"
                            className="ui-icon-hover-24-target"
                          />
                        ),
                        label: t("skillConsole.action.rename"),
                        disabled: interactionLocked,
                      }
                    : null,
                  entry.deletable ? { type: "divider" as const } : null,
                  entry.deletable
                    ? {
                        key: "delete",
                        className: "ui-icon-hover-24",
                        icon: (
                          <MaterialIcon
                            name="delete"
                            className="ui-icon-hover-24-target"
                          />
                        ),
                        label: t("skillConsole.action.delete"),
                        danger: true,
                        disabled: interactionLocked,
                      }
                    : null,
                ].filter(Boolean);
                const hasEntryActions = entryMenuItems.length > 0;
                return (
                  <div key={entry.path} className="tw:group tw:relative">
                    <button
                      type="button"
                      className={`tw:rounded-none tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-1 tw:border-0 tw:bg-transparent tw:py-1 tw:text-left tw:text-[13px] tw:leading-[1.35] tw:text-ink-1 tw:hover:bg-bg-hover ${
                        isSelected ? "tw:bg-bg-selected tw:font-medium" : ""
                      }`}
                      style={{
                        paddingLeft,
                        paddingRight: 8,
                        ...(isSelected
                          ? { backgroundColor: "var(--bg-selected)" }
                          : null),
                      }}
                      disabled={interactionLocked}
                      onClick={() => {
                        void onSelectFileEntry(entry);
                      }}
                    >
                      <SkillFileEntryIcon
                        entry={entry}
                        expanded={expandedDirs.has(entry.path)}
                      />
                      <span className="tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap group-hover:tw:pe-[18px]">
                        {entry.name}
                      </span>
                      {isDirty && (
                        <span
                          className="tw:inline-block tw:h-2 tw:w-2 tw:flex-none tw:rounded-full"
                          style={{
                            backgroundColor: "var(--accent-warning, #ff7d00)",
                          }}
                          title={t("skillConsole.message.unsaved")}
                        />
                      )}
                    </button>
                    {hasEntryActions && (
                      <Dropdown
                        trigger={["click"]}
                        placement="bottomRight"
                        getPopupContainer={(trigger) =>
                          trigger.parentElement || trigger
                        }
                        menu={{
                          items: entryMenuItems,
                          onClick: ({ domEvent, key }) => {
                            domEvent.stopPropagation();
                            if (key === "download") onDownloadEntry?.(entry);
                            else if (key === "replace") {
                              replaceTargetRef.current = entry;
                              fileInputRef.current?.click();
                            } else if (key === "rename") onRenameEntry?.(entry);
                            else if (key === "delete") onDeleteEntry?.(entry);
                          },
                        }}
                      >
                        <button
                          type="button"
                          className="tw:absolute tw:top-1/2 tw:right-1 tw:flex tw:h-5 tw:w-5 tw:-translate-y-1/2 tw:items-center tw:justify-center tw:rounded-[3px] tw:border-0 tw:bg-transparent tw:p-0 tw:text-ink-muted tw:opacity-0 tw:pointer-events-none tw:cursor-pointer tw:hover:bg-bg-hover tw:hover:text-ink-1 tw:group-hover:opacity-100 tw:group-hover:pointer-events-auto tw:group-focus-within:opacity-100 tw:group-focus-within:pointer-events-auto"
                          aria-label={moreLabel}
                          title={moreLabel}
                          aria-haspopup="menu"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MaterialIcon
                            name="more_horiz"
                            className="tw:h-[14px] tw:w-[14px] tw:text-[14px]"
                          />
                        </button>
                      </Dropdown>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="tw:text-[11px] tw:text-ink-muted tw:p-1">
                {t("skillConsole.fileTree.empty")}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

/* ---- component ---- */

export interface SkillConsoleProps {
  selectedSkillKey: string;
  onSelectSkillKey: (skillKey: string) => void;
  onClearSelection: () => void;
}

export const SkillConsole: React.FC<SkillConsoleProps> = ({
  selectedSkillKey,
  onSelectSkillKey,
  onClearSelection,
}) => {
  const { t } = useI18n();
  const { modal } = AntdApp.useApp();
  const assistant = useResourceAssistant();
  const editorRegion = useRef<HTMLDivElement>(null);
  const {
    pinnedSkillKeys,
    toggleSkillPin,
    pinsDisabled,
    pinError,
    refreshPins,
  } = usePinnedSkills(true);

  const [skills, setSkills] = useState<AdminSkillSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [fileTreeOpen, setFileTreeOpen] = useState(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return true;
    return !window.matchMedia("(max-width: 860px)").matches;
  });
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  // 左侧 skill 列表列宽；拖拽手柄在列表右缘，向右拖变宽
  const [listWidth, setListWidth] = useState(260);
  const listStartWidthRef = useRef(240);
  const { handlePointerDown: handleListResize } = usePanelResize({
    axis: "horizontal",
    onResizeStart: () => {
      listStartWidthRef.current = listWidth;
    },
    onResize: (delta) =>
      setListWidth(
        Math.max(180, Math.min(480, listStartWidthRef.current + delta)),
      ),
  });

  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<AdminSkillDetailResponse | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [originalFileContent, setOriginalFileContent] = useState("");
  const [fileSha256, setFileSha256] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | undefined>(undefined);
  const [fileUpdatedAt, setFileUpdatedAt] = useState<number | undefined>(
    undefined,
  );
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [deletingSkill, setDeletingSkill] = useState(false);
  const [downloadingSkill, setDownloadingSkill] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(["references", "scripts", "assets"]),
  );

  const detailRef = useRef<AdminSkillDetailResponse | null>(null);
  const suppressAutoSelectAfterDeleteRef = useRef(false);
  // 程序化选中（创建/导入/点击）发起到 URL 参数回流前的在途 key；此窗口内禁止 auto-select 抢跳，避免与导入导航来回争夺选中
  const pendingSelectionRef = useRef<string | null>(null);
  // 详情/文件异步加载的单调序号；只应用最新一次请求的结果，丢弃过期响应，防止旧 key 内容覆盖当前
  const loadSeqRef = useRef(0);
  detailRef.current = detail;

  const selectedEntry = useMemo(
    () => findEntryByPath(detail?.fileManifest.entries || [], selectedFilePath),
    [detail?.fileManifest.entries, selectedFilePath],
  );
  const isFileDirty = dirtyFiles.has(selectedFilePath);

  const filteredSkills = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    return sortPinnedItems(skills, pinnedSkillKeys, (item) => item.key).filter(
      (item) => {
        if (statusFilter !== "all" && item.status !== statusFilter)
          return false;
        if (!needle) return true;
        const haystack = [
          item.key,
          item.name,
          item.description || "",
          item.source?.path || "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      },
    );
  }, [skills, searchText, statusFilter, pinnedSkillKeys]);

  const applyOpenedFile = useCallback((file: AdminSkillTextFile) => {
    applyOpenedFileState(
      file,
      setSelectedFilePath,
      setFileContent,
      setOriginalFileContent,
      setFileSha256,
      setFileSize,
      setFileUpdatedAt,
      setDirtyFiles,
    );
  }, []);

  const applyBinaryEntry = useCallback((entry: AdminSkillFileEntry) => {
    setSelectedFilePath(entry.path);
    setFileContent("");
    setOriginalFileContent("");
    setFileSha256(entry.sha256 || null);
    setFileSize(entry.size);
    setFileUpdatedAt(entry.updatedAt);
  }, []);

  const clearFileState = useCallback(() => {
    setSelectedFilePath("");
    setFileContent("");
    setOriginalFileContent("");
    setFileSha256(null);
    setFileSize(undefined);
    setFileUpdatedAt(undefined);
  }, []);

  const loadSkills = useCallback(async () => {
    setListLoading(true);
    try {
      const response = await getAdminSkills();
      setSkills(response.data);
    } catch (err) {
      notification.error({
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadFileByPath = useCallback(
    async (skillKey: string, path: string, seq?: number) => {
      const normalizedPath = path.trim();
      if (!skillKey || !normalizedPath) return null;
      const token = seq ?? ++loadSeqRef.current;
      try {
        const response = await getAdminSource({
          type: "skill",
          key: skillKey,
          path: normalizedPath,
        });
        if (token !== loadSeqRef.current) return null;
        const opened = adminSourceToSkillTextFile(response.data);
        applyOpenedFile(opened);
        return opened;
      } catch (err) {
        if (token !== loadSeqRef.current) return null;
        notification.error({
          message: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },
    [applyOpenedFile],
  );

  const loadDetail = useCallback(
    async (skillKey: string, preferredFilePath = "") => {
      const normalizedSkillKey = skillKey.trim();
      if (!normalizedSkillKey) return;
      const seq = ++loadSeqRef.current;
      setDetailLoading(true);
      try {
        const requestedOpenPath = preferredFilePath || "SKILL.md";
        const response = await getAdminSkillDetail(
          normalizedSkillKey,
          requestedOpenPath,
        );
        if (seq !== loadSeqRef.current) return;
        const d = response.data;
        setDetail(d);
        detailRef.current = d;
        setDirtyFiles(new Set());

        const targetEntry = findPreferredSkillFileEntry(
          d.fileManifest.entries || [],
          preferredFilePath || d.openedFile?.path || requestedOpenPath,
          d.fileManifest.defaultOpenPath,
        );
        if (
          d.openedFile &&
          (!targetEntry || d.openedFile.path === targetEntry.path)
        ) {
          applyOpenedFile(d.openedFile);
        } else if (targetEntry?.contentKind === "text") {
          await loadFileByPath(d.skill.key, targetEntry.path, seq);
        } else if (targetEntry?.contentKind === "binary") {
          applyBinaryEntry(targetEntry);
        } else {
          clearFileState();
        }
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        notification.error({
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (seq === loadSeqRef.current) setDetailLoading(false);
      }
    },
    [applyBinaryEntry, applyOpenedFile, clearFileState, loadFileByPath],
  );

  const selectFileEntry = useCallback(
    async (entry: AdminSkillFileEntry) => {
      const currentDetail = detailRef.current;
      if (!currentDetail) return;

      if (entry.kind === "directory") {
        setExpandedDirs((prev) => toggleSkillExpandedDir(prev, entry.path));
      }

      if (isFileDirty && selectedFilePath !== entry.path) {
        const ok = await new Promise<boolean>((resolve) => {
          modal.confirm({
            title: t("skillConsole.confirm.switchFile"),
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!ok) return;
        setDirtyFiles((prev) => {
          const next = new Set(prev);
          next.delete(selectedFilePath);
          return next;
        });
      }

      if (entry.contentKind === "text") {
        await loadFileByPath(currentDetail.skill.key, entry.path);
      } else {
        applyBinaryEntry(entry);
      }
    },
    [applyBinaryEntry, isFileDirty, loadFileByPath, selectedFilePath, t],
  );

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    if (selectedSkillKey) {
      pendingSelectionRef.current = null;
      suppressAutoSelectAfterDeleteRef.current = false;
      void loadDetail(selectedSkillKey);
      return;
    }
  }, [loadDetail, selectedSkillKey]);

  useEffect(() => {
    if (
      skills.length === 0 ||
      selectedSkillKey ||
      pendingSelectionRef.current ||
      suppressAutoSelectAfterDeleteRef.current
    )
      return;
    const firstReady = skills.find((s) => s.status === "ready");
    if (firstReady) {
      pendingSelectionRef.current = firstReady.key;
      onSelectSkillKey(firstReady.key);
    }
  }, [onSelectSkillKey, selectedSkillKey, skills]);

  const handleSelectSkill = (item: AdminSkillSummary) => {
    if (deletingSkill) return;
    const select = () => {
      pendingSelectionRef.current = item.key;
      suppressAutoSelectAfterDeleteRef.current = false;
      onSelectSkillKey(item.key);
    };
    if (dirtyFiles.size > 0) {
      modal.confirm({
        title: t("skillConsole.confirm.switchSkill"),
        onOk: select,
      });
      return;
    }
    select();
  };

  const applyMutation = useCallback(
    async (mutation: AdminSkillMutationResponse) => {
      const currentDetail = detailRef.current;
      if (!currentDetail) return;
      const nextDetail = mergeDetailWithMutation(currentDetail, mutation);
      setDetail(nextDetail);
      detailRef.current = nextDetail;
      if (mutation.skill) {
        setSkills((prev) =>
          prev.map((item) =>
            item.key === mutation.skill?.key ? mutation.skill : item,
          ),
        );
      }
      if (mutation.openedFile) {
        applyOpenedFile(mutation.openedFile);
        return;
      }
      const targetEntry = findPreferredSkillFileEntry(
        nextDetail.fileManifest.entries,
        mutation.selectedPath || selectedFilePath,
        nextDetail.fileManifest.defaultOpenPath,
      );
      if (targetEntry?.contentKind === "text") {
        await loadFileByPath(nextDetail.skill.key, targetEntry.path);
      } else if (targetEntry?.contentKind === "binary") {
        applyBinaryEntry(targetEntry);
      } else {
        clearFileState();
      }
    },
    [
      applyBinaryEntry,
      applyOpenedFile,
      clearFileState,
      loadFileByPath,
      selectedFilePath,
    ],
  );

  const handleRefreshFile = async () => {
    if (!detail || !selectedFilePath || !selectedEntry) return;
    if (isFileDirty) {
      const ok = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: t("skillConsole.confirm.switchFile"),
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!ok) return;
      setDirtyFiles((prev) => {
        const next = new Set(prev);
        next.delete(selectedFilePath);
        return next;
      });
    }
    if (selectedEntry.contentKind === "text") {
      await loadFileByPath(detail.skill.key, selectedFilePath);
    } else {
      await loadDetail(detail.skill.key, selectedFilePath);
    }
  };

  const handleSave = async () => {
    if (
      !detail ||
      !selectedFilePath ||
      !isFileDirty ||
      selectedEntry?.contentKind !== "text"
    )
      return;
    setSaving(true);
    try {
      const response = await updateAdminSource({
        target: {
          type: "skill",
          key: detail.skill.key,
          path: selectedFilePath,
        },
        content: fileContent,
        baseSha256: fileSha256 || undefined,
      });
      applyOpenedFile(adminSourceToSkillTextFile(response.data));
      await loadDetail(detail.skill.key, selectedFilePath);
      notification.success({ message: t("skillConsole.message.saveSuccess") });
    } catch (err) {
      notification.error({ message: t("skillConsole.message.saveFailed") });
      notification.error({
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleValidateSkillKey = async (skillKey: string) => {
    setValidating(true);
    try {
      const response = await validateAdminSkill(skillKey);
      const result = response.data;
      setSkills((prev) =>
        prev.map((item) =>
          item.key === skillKey
            ? {
                ...item,
                status: result.status,
                updatedAt: result.updatedAt ?? item.updatedAt,
                size: result.size ?? item.size,
                diagnosticCount:
                  result.diagnostics?.length ?? item.diagnosticCount,
              }
            : item,
        ),
      );
      setDetail((prev) => {
        if (!prev || prev.skill.key !== skillKey) return prev;
        const next = {
          ...prev,
          skill: {
            ...prev.skill,
            status: result.status,
            updatedAt: result.updatedAt ?? prev.skill.updatedAt,
            size: result.size ?? prev.skill.size,
            diagnosticCount:
              result.diagnostics?.length ?? prev.skill.diagnosticCount,
          },
          diagnostics: result.diagnostics,
        };
        detailRef.current = next;
        return next;
      });
      if (result.status === "invalid") {
        notification.warning({
          message: t("skillConsole.message.validateInvalid", {
            count: result.diagnostics?.length || 0,
          }),
        });
      } else {
        notification.success({
          message: t("skillConsole.message.validateSuccess"),
        });
      }
    } catch (err) {
      notification.error({
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setValidating(false);
    }
  };

  const handleCreateFile = () => {
    if (!detail) return;
    const anchor = skillAnchorPath(selectedEntry);
    let inputValue = "";
    modal.confirm({
      title: t("skillConsole.fileOp.createFile"),
      content: (
        <div className="tw:flex tw:flex-col tw:gap-2">
          <Input
            autoFocus
            placeholder={t("skillConsole.create.fileNamePlaceholder")}
            onChange={(e) => {
              inputValue = e.target.value;
            }}
          />
          <span className="tw:text-xs tw:text-ink-muted">
            {t("skillConsole.fileOp.createIn", {
              path: anchor ? `${anchor}/` : t("skillConsole.fileTree.root"),
            })}
          </span>
        </div>
      ),
      onOk: async () => {
        const name = inputValue.trim();
        if (!name || !isFilePathSafe(name)) return;
        const response = await createAdminSkillFile({
          key: detail.skill.key,
          path: joinSkillPath(anchor, name),
          content: "",
        });
        if (anchor) {
          setExpandedDirs((prev) => {
            const next = new Set(prev);
            next.add(anchor);
            return next;
          });
        }
        await applyMutation(response.data);
      },
    });
  };

  const handleCreateDir = () => {
    if (!detail) return;
    const anchor = skillSiblingPath(selectedEntry);
    let inputValue = "";
    modal.confirm({
      title: t("skillConsole.fileOp.createDir"),
      content: (
        <div className="tw:flex tw:flex-col tw:gap-2">
          <Input
            autoFocus
            placeholder={t("skillConsole.create.dirNamePlaceholder")}
            onChange={(e) => {
              inputValue = e.target.value;
            }}
          />
          <span className="tw:text-xs tw:text-ink-muted">
            {t("skillConsole.fileOp.createIn", {
              path: anchor ? `${anchor}/` : t("skillConsole.fileTree.root"),
            })}
          </span>
        </div>
      ),
      onOk: async () => {
        const name = inputValue.trim();
        if (!name || !isFilePathSafe(name)) return;
        const path = joinSkillPath(anchor, name);
        const response = await mkdirAdminSkillFile({
          key: detail.skill.key,
          path,
        });
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          if (anchor) next.add(anchor);
          next.add(path);
          return next;
        });
        await applyMutation(response.data);
        setSelectedFilePath(path);
        setFileContent("");
        setOriginalFileContent("");
        setFileSha256(null);
        setFileSize(undefined);
        setFileUpdatedAt(undefined);
      },
    });
  };

  const handleCreateSubdir = () => {
    if (!detail || selectedEntry?.kind !== "directory") return;
    const anchor = selectedEntry.path;
    let inputValue = "";
    modal.confirm({
      title: t("skillConsole.fileOp.createSubdir"),
      content: (
        <div className="tw:flex tw:flex-col tw:gap-2">
          <Input
            autoFocus
            placeholder={t("skillConsole.create.dirNamePlaceholder")}
            onChange={(e) => {
              inputValue = e.target.value;
            }}
          />
          <span className="tw:text-xs tw:text-ink-muted">
            {t("skillConsole.fileOp.createIn", {
              path: anchor ? `${anchor}/` : t("skillConsole.fileTree.root"),
            })}
          </span>
        </div>
      ),
      onOk: async () => {
        const name = inputValue.trim();
        if (!name || !isFilePathSafe(name)) return;
        const path = joinSkillPath(anchor, name);
        const response = await mkdirAdminSkillFile({
          key: detail.skill.key,
          path,
        });
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(anchor);
          next.add(path);
          return next;
        });
        await applyMutation(response.data);
        setSelectedFilePath(path);
        setFileContent("");
        setOriginalFileContent("");
        setFileSha256(null);
        setFileSize(undefined);
        setFileUpdatedAt(undefined);
      },
    });
  };

  const handleRenameEntry = (entry?: AdminSkillFileEntry) => {
    const target = entry ?? selectedEntry;
    if (!detail || !target || !target.renamable) return;
    let inputValue = target.path;
    modal.confirm({
      title: t("skillConsole.fileOp.rename"),
      content: (
        <Input
          autoFocus
          defaultValue={target.path}
          onChange={(e) => {
            inputValue = e.target.value;
          }}
        />
      ),
      onOk: async () => {
        const newPath = inputValue.trim();
        if (!newPath || !isFilePathSafe(newPath) || newPath === target.path)
          return;
        const response = await renameAdminSkillFile({
          key: detail.skill.key,
          fromPath: target.path,
          toPath: newPath,
        });
        await applyMutation(response.data);
      },
    });
  };

  const handleDeleteEntry = (entry?: AdminSkillFileEntry) => {
    const target = entry ?? selectedEntry;
    if (!detail || !target || !target.deletable) return;
    modal.confirm({
      title: t("skillConsole.fileOp.deleteConfirm", {
        type: t("skillConsole.fileTree.root"),
        name: target.path,
      }),
      okButtonProps: { danger: true },
      onOk: async () => {
        const response = await deleteAdminSkillFile({
          key: detail.skill.key,
          path: target.path,
          recursive: target.kind === "directory",
          baseSha256:
            target.path === selectedFilePath && target.contentKind === "text"
              ? fileSha256 || undefined
              : undefined,
        });
        await applyMutation(response.data);
      },
    });
  };

  const handleDownloadEntry = async (entry?: AdminSkillFileEntry) => {
    const target = entry ?? selectedEntry;
    if (!detail || !target?.downloadable) return;
    setDownloadingFile(true);
    try {
      await downloadAdminSkillFile(detail.skill.key, target.path);
    } catch (err) {
      notification.error({
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDownloadingFile(false);
    }
  };

  const handleDownloadSkillByKey = async (skillKey: string) => {
    setDownloadingSkill(true);
    try {
      await downloadAdminSkill(skillKey);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      notification.error({
        message: `${t("skillConsole.message.downloadSkillFailed")}: ${reason}`,
      });
    } finally {
      setDownloadingSkill(false);
    }
  };

  const handleDeleteSkillByKey = (
    skillKey: string,
    skillName: string,
    hasUnsavedChanges: boolean,
  ) => {
    if (deletingSkill) return;
    modal.confirm({
      title: t("skillConsole.delete.title"),
      content: (
        <div className="tw:flex tw:flex-col tw:gap-2">
          <span>{t("skillConsole.delete.confirm", { name: skillName })}</span>
          {hasUnsavedChanges && (
            <span className="tw:text-danger">
              {t("skillConsole.delete.unsavedWarning")}
            </span>
          )}
        </div>
      ),
      okText: t("skillConsole.action.delete"),
      cancelText: t("skillConsole.action.cancel"),
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingSkill(true);
        try {
          const outcome = await requestSkillDeletion(skillKey);
          if (outcome.kind === "blocked") {
            notification.warning({
              message: t("skillConsole.delete.blockedByAgents", {
                agents: outcome.usedByAgents.join(", "),
              }),
            });
            return;
          }

          setSkills((prev) =>
            prev.filter(
              (item) => item.key !== skillKey && item.key !== outcome.key,
            ),
          );
          if (detailRef.current?.skill.key === skillKey) {
            suppressAutoSelectAfterDeleteRef.current = true;
            setDetail(null);
            detailRef.current = null;
            setDirtyFiles(new Set());
            clearFileState();
            onClearSelection();
          }
          notification.success({
            message: t("skillConsole.message.deleteSuccess", {
              name: skillName,
            }),
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          notification.error({
            message: t("skillConsole.message.deleteFailed", { detail: reason }),
          });
        } finally {
          setDeletingSkill(false);
        }
      },
    });
  };

  const handleDeleteSkillListItem = (item: AdminSkillSummary) => {
    handleDeleteSkillByKey(
      item.key,
      item.name || item.key,
      detail?.skill.key === item.key && dirtyFiles.size > 0,
    );
  };

  const handleReplaceEntryFile = async (
    entry: AdminSkillFileEntry,
    file: File,
  ) => {
    if (!detail || !(entry.uploadable && entry.contentKind === "binary"))
      return;
    setSaving(true);
    try {
      const response = await uploadAdminSkillFile({
        key: detail.skill.key,
        path: entry.path,
        file,
        overwrite: true,
      });
      await applyMutation(response.data);
    } catch (err) {
      notification.error({
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadFile = async (file: File) => {
    if (!detail) return;
    const anchor = skillAnchorPath(selectedEntry);
    const path = joinSkillPath(anchor, file.name);
    setSaving(true);
    try {
      const response = await uploadAdminSkillFile({
        key: detail.skill.key,
        path,
        file,
        overwrite: false,
      });
      await applyMutation(response.data);
      if (anchor) {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(anchor);
          return next;
        });
      }
      const uploadedEntry = detailRef.current?.fileManifest.entries.find(
        (entry) => entry.path === path,
      );
      if (uploadedEntry?.contentKind === "text") {
        await loadFileByPath(detail.skill.key, path);
      } else if (uploadedEntry) {
        applyBinaryEntry(uploadedEntry);
      }
    } catch (err) {
      notification.error({
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDiscardBeforeAdding = async (): Promise<boolean> => {
    if (dirtyFiles.size === 0) return true;
    return new Promise<boolean>((resolve) => {
      modal.confirm({
        title: t("skillConsole.confirm.createWithUnsaved"),
        content: t("skillConsole.confirm.createWithUnsavedDescription"),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };

  const completeSkillCreation = (created: AdminSkillDetailResponse) => {
    const key = created.skill.key;
    pendingSelectionRef.current = key;
    suppressAutoSelectAfterDeleteRef.current = false;
    setSkills((prev) =>
      [...prev.filter((item) => item.key !== key), created.skill].sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
    );
    setCreateModalOpen(false);
    notification.success({
      message: t("skillConsole.message.createSuccess", {
        name: created.skill.name || key,
      }),
    });
    onSelectSkillKey(key);
  };

  const handleDirectCreate = async (
    key: string,
    name: string,
  ): Promise<boolean> => {
    if (!(await confirmDiscardBeforeAdding())) return false;
    const skillMd = `---\nname: ${name}\ndescription: \n---\n\n# ${name}\n`;
    const response = await createAdminSkill({ key, skillMd });
    completeSkillCreation(response.data);
    return true;
  };

  const handleZipImport = async (key: string, file: File): Promise<boolean> => {
    if (!(await confirmDiscardBeforeAdding())) return false;
    const response = await importAdminSkill({ ...(key ? { key } : {}), file });
    if (response.data.kind === "skill-package") {
      const installed = response.data.package;
      const nextKey = installed.skills.some(
        (skill) => skill.id === selectedSkillKey,
      )
        ? selectedSkillKey
        : installed.skills[0]?.id;
      pendingSelectionRef.current = nextKey || null;
      suppressAutoSelectAfterDeleteRef.current = !nextKey;
      setCreateModalOpen(false);
      setDirtyFiles(new Set());
      setSearchText("");
      setStatusFilter("all");
      notification.success({
        message: t("skillConsole.import.packageSuccess", {
          name: installed.name || installed.id,
          count: installed.skills.length,
        }),
      });
      await loadSkills();
      if (nextKey) {
        if (nextKey === selectedSkillKey) await loadDetail(nextKey);
        else onSelectSkillKey(nextKey);
      }
    } else {
      completeSkillCreation(response.data);
    }
    return true;
  };

  const handleFileChange = (value: string) => {
    setFileContent(value);
    setDirtyFiles((prev) =>
      updateSkillDirtyFiles(prev, selectedFilePath, value, originalFileContent),
    );
  };

  const statusMenu: MenuProps = useMemo(
    () => ({
      onClick: (info) => setStatusFilter(info.key as StatusFilter),
      selectedKeys: [statusFilter],
      items: STATUS_FILTERS.map((status) => ({
        key: status,
        label: translateWithFallback(
          t,
          `skillConsole.statusFilter.${status}`,
          status,
        ),
      })),
    }),
    [t, statusFilter],
  );

  return (
    <div className={SKILL_CONSOLE_CLASS_NAME}>
      <SkillCreateModal
        open={createModalOpen}
        existingKeys={skills.map((item) => item.key)}
        t={t}
        onCancel={() => setCreateModalOpen(false)}
        onDirectCreate={handleDirectCreate}
        onZipImport={handleZipImport}
      />

      <div
        className={SKILL_BODY_CLASS_NAME}
        style={{ "--skill-list-col": `${listWidth}px` } as React.CSSProperties}
      >
        <div className={SKILL_LIST_CLASS_NAME}>
          <div className={SKILL_TOOLBAR_CLASS_NAME}>
            <SearchFilterBar
              searchText={searchText}
              onSearchChange={setSearchText}
              searchPlaceholder={t("skillConsole.searchPlaceholder")}
              filters={[
                {
                  key: "status",
                  label: t("skillConsole.statusFilter.all"),
                  icon: "filter_list",
                  active: statusFilter !== "all",
                  open: statusDropdownOpen,
                  onOpenChange: setStatusDropdownOpen,
                  menu: statusMenu,
                },
              ]}
            />
            <UiButton
              size="sm"
              variant="ghost"
              className="ui-icon-hover-24"
              iconOnly
              onClick={() => {
                void loadSkills();
                void refreshPins().catch(() => undefined);
              }}
              disabled={listLoading || deletingSkill}
              aria-label={t("skillConsole.action.refresh")}
            >
              <MaterialIcon name="refresh" />
            </UiButton>
            <CreateMenuButton label={t("skillConsole.action.createSkill")} disabled={deletingSkill || assistant.opening}
              onManual={() => setCreateModalOpen(true)}
              onConversation={async () => { if (await confirmDiscardBeforeAdding()) void assistant.open({ kind: "skill" }); }} />
          </div>

          <div className={SKILL_COUNT_CLASS_NAME}>
            {t("skillConsole.list.count", { count: filteredSkills.length })}
          </div>

          {pinError && (
            <div role="alert" className="tw:text-xs tw:text-danger">
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
          <div className={SKILL_LIST_SCROLL_CLASS_NAME}>
            <Spin spinning={listLoading}>
              {filteredSkills.length === 0 ? (
                <div className="command-empty-state">
                  {searchText
                    ? t("skillConsole.message.noMatch")
                    : t("skillConsole.empty")}
                  {!searchText && (
                    <UiButton
                      size="sm"
                      variant="primary"
                      onClick={() => setCreateModalOpen(true)}
                      disabled={deletingSkill}
                    >
                      {t("skillConsole.action.createSkill")}
                    </UiButton>
                  )}
                </div>
              ) : (
                <div className={SKILL_LIST_ITEMS_CLASS_NAME}>
                  {filteredSkills.map((item) => {
                    const itemPinned = pinnedSkillKeys.includes(
                      item.key.toLowerCase(),
                    );
                    return (
                      <div
                        key={item.key}
                        className={SKILL_LIST_ITEM_WRAP_CLASS_NAME}
                        data-pinned={itemPinned || undefined}
                      >
                        <button
                          type="button"
                          className={`${SKILL_LIST_ITEM_CLASS_NAME} ${
                            item.key === selectedSkillKey ? "is-active" : ""
                          }`}
                          disabled={deletingSkill}
                          onClick={() => handleSelectSkill(item)}
                        >
                          <span className={SKILL_LIST_ITEM_HEAD_CLASS_NAME}>
                            <SkillListIcon icon={item.icon} />
                            <span className={SKILL_LIST_ITEM_TITLE_CLASS_NAME}>
                              <Flex
                                gap={6}
                                align="center"
                                className="tw:w-full"
                              >
                                <Typography.Text
                                  className="tw:flex-1 tw:group-hover:pe-[22px] tw:group-focus-within:pe-[22px]"
                                  ellipsis
                                  title={item.name || item.key}
                                >
                                  <strong>{item.name || item.key}</strong>
                                </Typography.Text>
                                <SkillListItemStatus
                                  status={item.status}
                                  statusLabel={translateWithFallback(
                                    t,
                                    `skillConsole.status.${item.status}`,
                                    item.status,
                                  )}
                                />
                              </Flex>
                              <Flex
                                justify="space-between"
                                align="center"
                                className="tw:w-full"
                                gap={10}
                              >
                                <Typography.Text
                                  className={SKILL_LIST_ITEM_META_CLASS_NAME}
                                  ellipsis
                                  title={item.key}
                                >
                                  {item.key}
                                </Typography.Text>
                                <SkillListItemVersion version={item.version} />
                              </Flex>
                            </span>
                          </span>
                        </button>
                        {itemPinned && (
                          <span
                            className={SKILL_LIST_ITEM_PINNED_CLASS_NAME}
                            aria-label={t("skillConsole.action.pin")}
                          >
                            <MaterialIcon
                              name="keep_fill"
                              className="tw:text-accent"
                            />
                          </span>
                        )}
                        <SkillListItemActions
                          item={item}
                          pinned={itemPinned}
                          busy={validating || downloadingSkill || deletingSkill || assistant.opening}
                          pinsDisabled={pinsDisabled}
                          t={t}
                          onTogglePin={(skillKey) => {
                            void toggleSkillPin(skillKey);
                          }}
                          onValidateSkill={(skillKey) => {
                            void handleValidateSkillKey(skillKey);
                          }}
                          onDownloadSkill={(skillKey) => {
                            void handleDownloadSkillByKey(skillKey);
                          }}
                          onDeleteSkill={handleDeleteSkillListItem}
                          onEditSkill={(item) => {
                            if (item.key === selectedSkillKey) focusEditableField(editorRegion.current);
                            else handleSelectSkill(item);
                          }}
                          onEditSkillConversation={async (item) => {
                            if (await confirmDiscardBeforeAdding()) void assistant.open({ kind: "skill", target: { id: item.key, name: item.name } });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </Spin>
          </div>
          <button
            type="button"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("skillConsole.resize.listAriaLabel")}
            title={t("skillConsole.resize.listTitle")}
            className={SKILL_RESIZE_HANDLE_CLASS_NAME}
            style={{ right: -6 }}
            onPointerDown={handleListResize}
          />
        </div>

        <div ref={editorRegion} className={SKILL_DETAIL_CLASS_NAME}>

          <Spin
            spinning={detailLoading}
            wrapperClassName="tw:h-full tw:min-h-0 tw:[&_.ant-spin-container]:h-full tw:[&_.ant-spin-container]:min-h-0"
          >
            {!detail ? (
              <div className="command-empty-state">
                {t("skillConsole.detail.empty")}
              </div>
            ) : (
              <SkillFileWorkspace
                detail={detail}
                selectedFilePath={selectedFilePath}
                fileContent={fileContent}
                fileSize={fileSize}
                fileSha256={fileSha256}
                dirtyFiles={dirtyFiles}
                expandedDirs={expandedDirs}
                isFileDirty={isFileDirty}
                saving={saving}
                deletingSkill={deletingSkill}
                downloadingFile={downloadingFile}
                fileTreeOpen={fileTreeOpen}
                onToggleFileTree={() => setFileTreeOpen((open) => !open)}
                t={t}
                onCreateFile={handleCreateFile}
                onCreateDir={handleCreateDir}
                onCreateSubdir={handleCreateSubdir}
                onUploadFile={handleUploadFile}
                onDownloadEntry={handleDownloadEntry}
                onReplaceEntry={handleReplaceEntryFile}
                onRenameEntry={handleRenameEntry}
                onDeleteEntry={handleDeleteEntry}
                onRefreshFile={handleRefreshFile}
                onSave={handleSave}
                onFileChange={handleFileChange}
                onSelectFileEntry={selectFileEntry}
              />
            )}
          </Spin>
        </div>
      </div>
    </div>
  );
};
