import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Alert, Input, Modal, Spin, Tabs } from "antd";
import type { MenuProps } from "antd";
import {
  createAdminSkillFile,
  createAdminSkill,
  deleteAdminSkillFile,
  downloadAdminSkill,
  downloadAdminSkillFile,
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
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";

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

/* ---- class names ---- */
const SKILL_CONSOLE_CLASS_NAME =
  "skill-console tw:flex tw:flex-auto tw:flex-col tw:min-h-0 tw:gap-3 tw:overflow-hidden";
const SKILL_BODY_CLASS_NAME =
  "skill-console-body tw:grid tw:min-h-0 tw:flex-auto tw:grid-cols-[280px_minmax(0,1fr)] tw:gap-4 tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";
const SKILL_LIST_CLASS_NAME =
  "skill-console-list tw:flex tw:min-h-0 tw:min-w-[280px] tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:min-w-0 tw:max-[860px]:max-h-[260px]";
const SKILL_TOOLBAR_CLASS_NAME =
  "skill-console-toolbar tw:grid tw:grid-cols-[minmax(0,1fr)_auto_auto] tw:items-center tw:gap-2";
const SKILL_LIST_SCROLL_CLASS_NAME =
  "skill-console-list-scroll tw:min-h-0 tw:flex-auto tw:overflow-auto tw:pr-0.5";
const SKILL_LIST_ITEMS_CLASS_NAME =
  "skill-console-list-items tw:flex tw:flex-col tw:gap-1.5";
const SKILL_LIST_ITEM_CLASS_NAME =
  "skill-console-list-item tw:flex tw:w-full tw:flex-col tw:gap-[3px] tw:rounded-control tw:border tw:border-transparent tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:text-ink-1 tw:hover:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:hover:bg-bg-hover tw:[&.is-active]:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:[&.is-active]:bg-bg-hover";
const SKILL_LIST_ITEM_HEAD_CLASS_NAME =
  "skill-console-list-item-head tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2 tw:[&_.ui-tag]:flex-none";
const SKILL_LIST_ITEM_ICON_CLASS_NAME =
  "skill-console-list-item-icon tw:h-7 tw:w-7 tw:flex-none tw:rounded-md tw:object-cover";
const SKILL_LIST_ITEM_TITLE_CLASS_NAME =
  "skill-console-list-item-title tw:inline-flex tw:min-w-0 tw:flex-1 tw:items-baseline tw:gap-[5px] tw:overflow-hidden tw:whitespace-nowrap tw:[&>strong]:min-w-0 tw:[&>strong]:overflow-hidden tw:[&>strong]:text-ellipsis tw:[&>strong]:text-[13px] tw:[&>strong]:leading-[1.35]";
const SKILL_LIST_ITEM_META_CLASS_NAME =
  "skill-console-list-item-meta tw:flex tw:min-w-0 tw:items-center tw:gap-1.5 tw:overflow-hidden tw:text-[11px] tw:leading-[1.35] tw:text-ink-muted";
const SKILL_COUNT_CLASS_NAME =
  "skill-console-count tw:text-xs tw:text-ink-muted";
const SKILL_DETAIL_CLASS_NAME =
  "skill-console-detail tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:overflow-hidden tw:max-[860px]:overflow-visible";
const SKILL_DETAIL_ACTIONS_CLASS_NAME =
  "skill-console-detail-actions tw:flex tw:flex-wrap tw:items-center tw:gap-2";
const SKILL_FILE_PANELS_CLASS_NAME =
  "skill-console-file-panels tw:grid tw:min-h-0 tw:h-full tw:grid-cols-[minmax(220px,286px)_minmax(0,1fr)] tw:gap-4 tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-visible";
const SKILL_FILE_TREE_PANEL_CLASS_NAME =
  "skill-console-file-tree-panel tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:max-h-[260px]";
const SKILL_FILE_TREE_TOOLBAR_CLASS_NAME =
  "skill-console-file-tree-toolbar tw:flex tw:items-center tw:justify-between tw:gap-2 tw:[&_.ui-btn-label]:gap-1";
const SKILL_FILE_TREE_CLASS_NAME =
  "skill-console-file-tree tw:min-h-0 tw:flex-auto tw:overflow-auto tw:rounded-control tw:border tw:p-1.5 tw:[border-color:color-mix(in_srgb,var(--line-soft)_82%,transparent)]";
const SKILL_FILE_EDITOR_CLASS_NAME =
  "skill-console-file-editor tw:flex tw:min-h-0 tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:overflow-visible";
const SKILL_FILE_EDITOR_HEAD_CLASS_NAME =
  "skill-console-file-editor-head tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2 tw:text-[11px] tw:text-ink-muted";
const SKILL_FILE_EDITOR_META_CLASS_NAME =
  "skill-console-file-editor-meta tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-2";
const SKILL_FILE_EDITOR_HEAD_PATH_CLASS_NAME =
  "skill-console-file-editor-head-path tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:font-code tw:text-ink-1";
const SKILL_TEXTAREA_CLASS_NAME =
  "skill-console-textarea tw:min-h-[520px] tw:flex-auto tw:resize-y tw:font-code tw:leading-[1.5] tw:[tab-size:2] tw:max-[860px]:min-h-80";
const SKILL_BINARY_PANEL_CLASS_NAME =
  "skill-console-binary-panel tw:flex tw:flex-col tw:gap-3 tw:rounded-control tw:border tw:p-3 tw:text-sm tw:text-ink-1 tw:[border-color:color-mix(in_srgb,var(--line-soft)_82%,transparent)]";
const SKILL_BINARY_GRID_CLASS_NAME =
  "skill-console-binary-grid tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:gap-x-3 tw:gap-y-2 tw:text-xs tw:[&>span:nth-child(odd)]:text-ink-muted tw:[&>span:nth-child(even)]:min-w-0 tw:[&>span:nth-child(even)]:overflow-hidden tw:[&>span:nth-child(even)]:text-ellipsis tw:[&>span:nth-child(even)]:whitespace-nowrap";
const SKILL_DIRTY_CLASS_NAME =
  "skill-console-dirty tw:text-xs tw:text-ink-muted";
const SKILL_MESSAGE_CLASS_NAME =
  "skill-console-message tw:absolute tw:left-[2px] tw:top-[2px] tw:right-[2px] tw:z-[100]";

/* ---- helpers ---- */

function statusTone(status: AdminSkillStatus): "accent" | "danger" | "muted" {
  if (status === "invalid") return "danger";
  if (status === "disabled") return "muted";
  return "accent";
}

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

function iconForEntry(entry: AdminSkillFileEntry): MaterialIconName {
  if (entry.kind === "directory") return "folder_open";
  if (entry.contentKind === "binary") return "folder_zip";
  return "description";
}

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

export const ADMIN_SKILL_IMPORT_MAX_BYTES = 32 * 1024 * 1024;

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
  if (existingKeys.some((candidate) => candidate.toLowerCase() === key.toLowerCase())) {
    return "exists";
  }
  return "";
}

export function suggestSkillKeyFromArchiveName(filename: string): string {
  const name = filename.trim().split(/[\\/]/).pop() || "";
  return name.replace(/\.zip$/i, "").trim();
}

export function validateSkillArchiveFile(
  file: Pick<File, "name" | "size"> | null,
): SkillArchiveFileValidationCode {
  if (!file || !file.name.toLowerCase().endsWith(".zip")) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > ADMIN_SKILL_IMPORT_MAX_BYTES) return "size";
  return "";
}

export function skillImportDiagnostics(error: unknown): SkillImportDiagnostic[] {
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
    return [{
      severity: String(diagnostic.severity || "").trim() || undefined,
      code: String(diagnostic.code || "").trim() || undefined,
      message,
      sourcePath: String(diagnostic.sourcePath || "").trim() || undefined,
    }];
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
  const [mode, setMode] = useState<SkillCreateMode>("direct");
  const [directKey, setDirectKey] = useState("");
  const [directName, setDirectName] = useState("");
  const [zipKey, setZipKey] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [archiveFileError, setArchiveFileError] = useState("");
  const [serverKeyError, setServerKeyError] = useState("");
  const [diagnostics, setDiagnostics] = useState<SkillImportDiagnostic[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("direct");
    setDirectKey("");
    setDirectName("");
    setZipKey("");
    setZipFile(null);
    setKeyTouched(false);
    setDragActive(false);
    setSubmitting(false);
    setSubmitError("");
    setArchiveFileError("");
    setServerKeyError("");
    setDiagnostics([]);
  }, [open]);

  const currentKey = mode === "direct" ? directKey : zipKey;
  const keyValidation = validateNewSkillKey(currentKey, existingKeys);
  const keyError = serverKeyError || (
    keyValidation && (keyTouched || Boolean(currentKey))
      ? t(`skillConsole.create.keyError.${keyValidation}`)
      : ""
  );
  const canSubmit = !keyValidation && (mode === "direct" || Boolean(zipFile));

  const resetError = () => {
    setSubmitError("");
    setServerKeyError("");
    setDiagnostics([]);
  };

  const acceptArchive = (file: File | null) => {
    resetError();
    const validation = validateSkillArchiveFile(file);
    if (validation) {
      setZipFile(null);
      setArchiveFileError(t(`skillConsole.import.error.${validation}`));
      return;
    }
    setArchiveFileError("");
    setZipFile(file as File);
    setZipKey(suggestSkillKeyFromArchiveName((file as File).name));
    setKeyTouched(true);
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    resetError();
    setSubmitting(true);
    try {
      const key = currentKey.trim();
      const completed = mode === "direct"
        ? await onDirectCreate(key, directName.trim() || key)
        : await onZipImport(key, zipFile as File);
      if (!completed) return;
    } catch (error) {
      const importedDiagnostics = skillImportDiagnostics(error);
      setDiagnostics(importedDiagnostics);
      const status = (error as { status?: unknown } | null)?.status;
      if (status === 409) {
        setServerKeyError(t("skillConsole.import.error.exists"));
      } else {
        setSubmitError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const directContent = (
    <div className="tw:flex tw:flex-col tw:gap-4 tw:pt-1">
      <label className="tw:flex tw:flex-col tw:gap-1.5" htmlFor="skill-create-key">
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
          <span id="skill-create-key-error" role="alert" className="tw:text-xs tw:text-danger">
            {keyError}
          </span>
        )}
      </label>
      <label className="tw:flex tw:flex-col tw:gap-1.5" htmlFor="skill-create-name">
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
      <div
        className={`tw:flex tw:min-h-36 tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-control tw:border tw:border-dashed tw:p-5 tw:text-center ${
          dragActive ? "tw:border-accent tw:bg-accent-soft" : "tw:border-line-soft tw:bg-bg-subtle"
        }`}
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
          acceptArchive(event.dataTransfer.files?.[0] || null);
        }}
      >
        <MaterialIcon name="folder_zip" />
        {zipFile ? (
          <>
            <strong className="tw:max-w-full tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-sm tw:text-ink-1">
              {zipFile.name}
            </strong>
            <span className="tw:text-xs tw:text-ink-muted">{formatSize(zipFile.size)}</span>
          </>
        ) : (
          <span className="tw:text-sm tw:text-ink-1">{t("skillConsole.import.drop")}</span>
        )}
        <UiButton
          size="sm"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting}
        >
          {zipFile ? t("skillConsole.import.replace") : t("skillConsole.import.select")}
        </UiButton>
      </div>
      {archiveFileError && (
        <Alert type="error" showIcon message={archiveFileError} />
      )}
      <label className="tw:flex tw:flex-col tw:gap-1.5" htmlFor="skill-import-key">
        <span className="tw:text-sm tw:font-medium tw:text-ink-1">
          {t("skillConsole.field.key")}
        </span>
        <Input
          id="skill-import-key"
          value={zipKey}
          placeholder="skill-key"
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
          <span id="skill-import-key-error" role="alert" className="tw:text-xs tw:text-danger">
            {keyError}
          </span>
        )}
      </label>
      <div className="tw:text-xs tw:leading-5 tw:text-ink-muted">
        {t("skillConsole.import.description")}
      </div>
      {submitting && (
        <div role="status" aria-live="polite" className="tw:text-xs tw:text-ink-muted">
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
      okText={t(mode === "direct" ? "skillConsole.create.submit" : "skillConsole.import.submit")}
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
          setMode(key as SkillCreateMode);
          setKeyTouched(false);
          setArchiveFileError("");
          resetError();
        }}
        items={[
          { key: "direct", label: t("skillConsole.create.mode.direct"), children: directContent },
          { key: "zip", label: t("skillConsole.create.mode.zip"), children: zipContent },
        ]}
      />
      {submitError && (
        <Alert className="tw:mt-3" type="error" showIcon message={submitError} />
      )}
      {diagnostics.length > 0 && (
        <ul className="tw:mt-3 tw:flex tw:list-disc tw:flex-col tw:gap-1 tw:pl-5 tw:text-xs tw:text-danger">
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code || "diagnostic"}-${diagnostic.sourcePath || index}`}>
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
  validating: boolean;
  downloadingSkill?: boolean;
  downloadingFile?: boolean;
  t: SkillConsoleTranslate;
  onCreateFile: () => void;
  onCreateDir: () => void;
  onDownloadSkill?: () => void;
  onValidate: () => void;
  onRefreshFile: () => void;
  onSave: () => void;
  onRenameFile: () => void;
  onDeleteFile: () => void;
  onDownloadFile: () => void;
  onReplaceFile: (file: File) => void;
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
  validating,
  downloadingSkill = false,
  downloadingFile = false,
  t,
  onCreateFile,
  onCreateDir,
  onDownloadSkill = () => {},
  onValidate,
  onRefreshFile,
  onSave,
  onRenameFile,
  onDeleteFile,
  onDownloadFile,
  onReplaceFile,
  onFileChange,
  onSelectFileEntry,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const entries = detail.fileManifest.entries || [];
  const selectedEntry = findEntryByPath(entries, selectedFilePath);
  const visibleEntries = entries.filter((entry) =>
    isSkillEntryVisible(entry, expandedDirs),
  );
  const isTextSelected = selectedEntry?.contentKind === "text";
  const isBinarySelected = selectedEntry?.contentKind === "binary";
  const canDownloadSkill = detail.capabilities.canDownload;

  return (
    <div className={SKILL_FILE_PANELS_CLASS_NAME}>
      <div className={SKILL_FILE_TREE_PANEL_CLASS_NAME}>
        <div className={SKILL_FILE_TREE_TOOLBAR_CLASS_NAME}>
          <span className="tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:font-medium tw:text-ink-muted">
            {t("skillConsole.fileTree.root")}
          </span>
          <div className={SKILL_DETAIL_ACTIONS_CLASS_NAME}>
            <UiButton
              size="sm"
              variant="ghost"
              iconOnly
              onClick={onCreateFile}
              aria-label={t("skillConsole.action.createFile")}
            >
              <MaterialIcon name="article" />
            </UiButton>
            <UiButton
              size="sm"
              variant="ghost"
              iconOnly
              onClick={onCreateDir}
              aria-label={t("skillConsole.action.createDir")}
            >
              <MaterialIcon name="create_new_folder" />
            </UiButton>
            <UiButton
              size="sm"
              variant="ghost"
              iconOnly
              onClick={onValidate}
              disabled={validating}
              aria-label={t("skillConsole.action.validate")}
            >
              <MaterialIcon name="rule" />
            </UiButton>
            <UiButton
              size="sm"
              variant="ghost"
              onClick={onDownloadSkill}
              disabled={downloadingSkill || !canDownloadSkill}
              loading={downloadingSkill}
              aria-label={
                downloadingSkill
                  ? t("skillConsole.action.downloadingSkill")
                  : t("skillConsole.action.downloadSkill")
              }
            >
              <MaterialIcon name="download" />
              {downloadingSkill
                ? t("skillConsole.action.downloadingSkill")
                : t("skillConsole.action.downloadSkill")}
            </UiButton>
          </div>
        </div>

        <div className={SKILL_FILE_TREE_CLASS_NAME}>
          {visibleEntries.length > 0 ? (
            visibleEntries.map((entry) => {
              const isSelected = entry.path === selectedFilePath;
              const isDirty = dirtyFiles.has(entry.path);
              const paddingLeft = 8 + entry.depth * 16;
              return (
                <div key={entry.path}>
                  <button
                    type="button"
                    className={`tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-1 tw:border-0 tw:bg-transparent tw:py-1 tw:text-left tw:text-[13px] tw:leading-[1.35] tw:text-ink-1 tw:hover:bg-bg-hover ${
                      isSelected ? "tw:bg-bg-selected tw:font-medium" : ""
                    }`}
                    style={{
                      paddingLeft,
                      paddingRight: 8,
                      ...(isSelected
                        ? { backgroundColor: "var(--bg-selected)" }
                        : null),
                    }}
                    onClick={() => {
                      void onSelectFileEntry(entry);
                    }}
                  >
                    <MaterialIcon name={iconForEntry(entry)} />
                    <span className="tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
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

      <div className={SKILL_FILE_EDITOR_CLASS_NAME}>
        {selectedEntry ? (
          <>
            <div className={SKILL_FILE_EDITOR_HEAD_CLASS_NAME}>
              <div className={SKILL_FILE_EDITOR_META_CLASS_NAME}>
                <MaterialIcon name={iconForEntry(selectedEntry)} />
                <span className={SKILL_FILE_EDITOR_HEAD_PATH_CLASS_NAME}>
                  {selectedEntry.path}
                </span>
                <span>
                  {isTextSelected
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
                  iconOnly
                  onClick={onRefreshFile}
                  disabled={saving}
                  aria-label={t("skillConsole.action.refresh")}
                >
                  <MaterialIcon name="refresh" />
                </UiButton>
                {isTextSelected && (
                  <UiButton
                    size="sm"
                    variant="primary"
                    iconOnly
                    onClick={onSave}
                    disabled={saving || !isFileDirty}
                    aria-label={t("skillConsole.action.save")}
                  >
                    <MaterialIcon name="save" />
                  </UiButton>
                )}
                {isBinarySelected && (
                  <UiButton
                    size="sm"
                    variant="ghost"
                    iconOnly
                    onClick={onDownloadFile}
                    disabled={downloadingFile || !selectedEntry.downloadable}
                    aria-label={t("skillConsole.action.download")}
                  >
                    <MaterialIcon name="download" />
                  </UiButton>
                )}
                {isBinarySelected && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="tw:hidden"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) onReplaceFile(file);
                      }}
                    />
                    <UiButton
                      size="sm"
                      variant="ghost"
                      iconOnly
                      onClick={() => fileInputRef.current?.click()}
                      aria-label={t("skillConsole.action.replaceFile")}
                    >
                      <MaterialIcon name="article" />
                    </UiButton>
                  </>
                )}
                {selectedEntry.renamable && (
                  <UiButton
                    size="sm"
                    variant="ghost"
                    iconOnly
                    onClick={onRenameFile}
                    aria-label={t("skillConsole.action.rename")}
                  >
                    <MaterialIcon name="edit" />
                  </UiButton>
                )}
                {selectedEntry.deletable && (
                  <UiButton
                    size="sm"
                    variant="ghost"
                    iconOnly
                    onClick={onDeleteFile}
                    aria-label={t("skillConsole.action.delete")}
                  >
                    <MaterialIcon name="delete" />
                  </UiButton>
                )}
              </div>
            </div>

            {isTextSelected ? (
              <Input.TextArea
                className={SKILL_TEXTAREA_CLASS_NAME}
                value={fileContent}
                onChange={(e) => onFileChange(e.target.value)}
              />
            ) : (
              <div className={SKILL_BINARY_PANEL_CLASS_NAME}>
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
          <div className="command-empty-state">
            {t("skillConsole.fileTree.empty")}
          </div>
        )}
      </div>
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
}) => {
  const { t } = useI18n();

  const [skills, setSkills] = useState<AdminSkillSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

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
  const [downloadingSkill, setDownloadingSkill] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(["references", "scripts", "assets"]),
  );

  const detailRef = useRef<AdminSkillDetailResponse | null>(null);
  detailRef.current = detail;

  const selectedEntry = useMemo(
    () => findEntryByPath(detail?.fileManifest.entries || [], selectedFilePath),
    [detail?.fileManifest.entries, selectedFilePath],
  );
  const isFileDirty = dirtyFiles.has(selectedFilePath);

  const filteredSkills = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    return skills.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
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
    });
  }, [skills, searchText, statusFilter]);

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
    setError("");
    try {
      const response = await getAdminSkills();
      setSkills(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadFileByPath = useCallback(
    async (skillKey: string, path: string) => {
      const normalizedPath = path.trim();
      if (!skillKey || !normalizedPath) return null;
      setError("");
      try {
        const response = await getAdminSource({
          type: "skill",
          key: skillKey,
          path: normalizedPath,
        });
        const opened = adminSourceToSkillTextFile(response.data);
        applyOpenedFile(opened);
        return opened;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [applyOpenedFile],
  );

  const loadDetail = useCallback(
    async (skillKey: string, preferredFilePath = "") => {
      const normalizedSkillKey = skillKey.trim();
      if (!normalizedSkillKey) return;
      setDetailLoading(true);
      setError("");
      try {
        const requestedOpenPath = preferredFilePath || "SKILL.md";
        const response = await getAdminSkillDetail(
          normalizedSkillKey,
          requestedOpenPath,
        );
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
          await loadFileByPath(d.skill.key, targetEntry.path);
        } else if (targetEntry?.contentKind === "binary") {
          applyBinaryEntry(targetEntry);
        } else {
          clearFileState();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setDetailLoading(false);
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
        return;
      }

      if (isFileDirty && selectedFilePath !== entry.path) {
        const ok = await new Promise<boolean>((resolve) => {
          Modal.confirm({
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
      void loadDetail(selectedSkillKey);
      return;
    }
  }, [loadDetail, selectedSkillKey]);

  useEffect(() => {
    if (skills.length === 0 || selectedSkillKey) return;
    const firstReady = skills.find((s) => s.status === "ready");
    if (firstReady) {
      onSelectSkillKey(firstReady.key);
    }
  }, [onSelectSkillKey, selectedSkillKey, skills]);

  const handleSelectSkill = (item: AdminSkillSummary) => {
    if (dirtyFiles.size > 0) {
      Modal.confirm({
        title: t("skillConsole.confirm.switchSkill"),
        onOk: () => {
          onSelectSkillKey(item.key);
        },
      });
      return;
    }
    onSelectSkillKey(item.key);
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
        Modal.confirm({
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
    setError("");
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
      setMessage(t("skillConsole.message.saveSuccess"));
    } catch (err) {
      setMessage(t("skillConsole.message.saveFailed"));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    if (!detail) return;
    setValidating(true);
    setError("");
    try {
      const response = await validateAdminSkill(detail.skill.key);
      const result = response.data;
      setDetail((prev) => {
        if (!prev) return prev;
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
        setMessage(
          t("skillConsole.message.validateInvalid", {
            count: result.diagnostics?.length || 0,
          }),
        );
      } else {
        setMessage(t("skillConsole.message.validateSuccess"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setValidating(false);
    }
  };

  const handleCreateFile = () => {
    if (!detail) return;
    let inputValue = "";
    Modal.confirm({
      title: t("skillConsole.fileOp.createFile"),
      content: (
        <Input
          autoFocus
          placeholder={t("skillConsole.create.fileNamePlaceholder")}
          onChange={(e) => {
            inputValue = e.target.value;
          }}
        />
      ),
      onOk: async () => {
        const name = inputValue.trim();
        if (!name || !isFilePathSafe(name)) return;
        const response = await createAdminSkillFile({
          key: detail.skill.key,
          path: name,
          content: "",
        });
        await applyMutation(response.data);
      },
    });
  };

  const handleCreateDir = () => {
    if (!detail) return;
    let inputValue = "";
    Modal.confirm({
      title: t("skillConsole.fileOp.createDir"),
      content: (
        <Input
          autoFocus
          placeholder={t("skillConsole.create.fileNamePlaceholder")}
          onChange={(e) => {
            inputValue = e.target.value;
          }}
        />
      ),
      onOk: async () => {
        const name = inputValue.trim();
        if (!name || !isFilePathSafe(name)) return;
        const response = await mkdirAdminSkillFile({
          key: detail.skill.key,
          path: name,
        });
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(name);
          return next;
        });
        await applyMutation(response.data);
      },
    });
  };

  const handleRenameFile = () => {
    if (!detail || !selectedEntry || !selectedEntry.renamable) return;
    let inputValue = selectedFilePath;
    Modal.confirm({
      title: t("skillConsole.fileOp.rename"),
      content: (
        <Input
          autoFocus
          defaultValue={selectedFilePath}
          onChange={(e) => {
            inputValue = e.target.value;
          }}
        />
      ),
      onOk: async () => {
        const newPath = inputValue.trim();
        if (
          !newPath ||
          !isFilePathSafe(newPath) ||
          newPath === selectedFilePath
        )
          return;
        const response = await renameAdminSkillFile({
          key: detail.skill.key,
          fromPath: selectedFilePath,
          toPath: newPath,
        });
        await applyMutation(response.data);
      },
    });
  };

  const handleDeleteFile = () => {
    if (!detail || !selectedEntry || !selectedEntry.deletable) return;
    Modal.confirm({
      title: t("skillConsole.fileOp.deleteConfirm", {
        type: t("skillConsole.fileTree.root"),
        name: selectedFilePath,
      }),
      okButtonProps: { danger: true },
      onOk: async () => {
        const response = await deleteAdminSkillFile({
          key: detail.skill.key,
          path: selectedFilePath,
          recursive: selectedEntry.kind === "directory",
          baseSha256:
            selectedEntry.contentKind === "text"
              ? fileSha256 || undefined
              : undefined,
        });
        await applyMutation(response.data);
      },
    });
  };

  const handleDownloadFile = async () => {
    if (!detail || !selectedFilePath || !selectedEntry?.downloadable) return;
    setDownloadingFile(true);
    setError("");
    try {
      await downloadAdminSkillFile(detail.skill.key, selectedFilePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingFile(false);
    }
  };

  const handleDownloadSkill = async () => {
    if (!detail || !detail.capabilities.canDownload) return;
    setDownloadingSkill(true);
    setError("");
    try {
      await downloadAdminSkill(detail.skill.key);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setError(`${t("skillConsole.message.downloadSkillFailed")}: ${reason}`);
    } finally {
      setDownloadingSkill(false);
    }
  };

  const handleReplaceFile = async (file: File) => {
    if (!detail || !selectedFilePath) return;
    setSaving(true);
    setError("");
    try {
      const response = await uploadAdminSkillFile({
        key: detail.skill.key,
        path: selectedFilePath,
        file,
        overwrite: true,
      });
      await applyMutation(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmDiscardBeforeAdding = async (): Promise<boolean> => {
    if (dirtyFiles.size === 0) return true;
    return new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: t("skillConsole.confirm.createWithUnsaved"),
        content: t("skillConsole.confirm.createWithUnsavedDescription"),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };

  const completeSkillCreation = (created: AdminSkillDetailResponse) => {
    const key = created.skill.key;
    setSkills((prev) =>
      [
        ...prev.filter((item) => item.key !== key),
        created.skill,
      ].sort((a, b) => a.key.localeCompare(b.key)),
    );
    setCreateModalOpen(false);
    setMessage(t("skillConsole.message.createSuccess", { name: created.skill.name || key }));
    onSelectSkillKey(key);
  };

  const handleDirectCreate = async (key: string, name: string): Promise<boolean> => {
    if (!(await confirmDiscardBeforeAdding())) return false;
    const skillMd = `---\nname: ${name}\ndescription: \n---\n\n# ${name}\n`;
    const response = await createAdminSkill({ key, skillMd });
    completeSkillCreation(response.data);
    return true;
  };

  const handleZipImport = async (key: string, file: File): Promise<boolean> => {
    if (!(await confirmDiscardBeforeAdding())) return false;
    const response = await importAdminSkill({ key, file });
    completeSkillCreation(response.data);
    return true;
  };

  const handleFileChange = (value: string) => {
    setFileContent(value);
    setDirtyFiles((prev) =>
      updateSkillDirtyFiles(prev, selectedFilePath, value, originalFileContent),
    );
    setMessage("");
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
      {error && (
        <Alert
          message={error}
          className={SKILL_MESSAGE_CLASS_NAME}
          type="error"
          showIcon
          action={
            <UiButton size="sm" variant="ghost" onClick={loadSkills}>
              {t("skillConsole.action.retry")}
            </UiButton>
          }
          closable
        />
      )}

      {message && !error && (
        <Alert
          message={message}
          className={SKILL_MESSAGE_CLASS_NAME}
          type="info"
          showIcon
          closable
        />
      )}

      <div className={SKILL_BODY_CLASS_NAME}>
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
              iconOnly
              onClick={loadSkills}
              disabled={listLoading}
              aria-label={t("skillConsole.action.refresh")}
            >
              <MaterialIcon name="refresh" />
            </UiButton>
            <UiButton
              size="sm"
              variant="primary"
              iconOnly
              onClick={() => setCreateModalOpen(true)}
              aria-label={t("skillConsole.action.createSkill")}
            >
              <MaterialIcon name="add" />
            </UiButton>
          </div>

          <div className={SKILL_COUNT_CLASS_NAME}>
            {t("skillConsole.list.count", { count: filteredSkills.length })}
          </div>

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
                    >
                      {t("skillConsole.action.createSkill")}
                    </UiButton>
                  )}
                </div>
              ) : (
                <div className={SKILL_LIST_ITEMS_CLASS_NAME}>
                  {filteredSkills.map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={`${SKILL_LIST_ITEM_CLASS_NAME} ${
                        item.key === selectedSkillKey ? "is-active" : ""
                      }`}
                      onClick={() => handleSelectSkill(item)}
                    >
                      <span className={SKILL_LIST_ITEM_HEAD_CLASS_NAME}>
                        <SkillListIcon icon={item.icon} />
                        <span className={SKILL_LIST_ITEM_TITLE_CLASS_NAME}>
                          <strong>{item.name || item.key}</strong>
                        </span>
                        <UiTag tone={statusTone(item.status)}>
                          {translateWithFallback(
                            t,
                            `skillConsole.status.${item.status}`,
                            item.status,
                          )}
                        </UiTag>
                      </span>
                      <span className={SKILL_LIST_ITEM_META_CLASS_NAME}>
                        <span className="tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
                          {item.key}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Spin>
          </div>
        </div>

        <div className={SKILL_DETAIL_CLASS_NAME}>
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
                validating={validating}
                downloadingSkill={downloadingSkill}
                downloadingFile={downloadingFile}
                t={t}
                onCreateFile={handleCreateFile}
                onCreateDir={handleCreateDir}
                onDownloadSkill={handleDownloadSkill}
                onValidate={handleValidate}
                onRefreshFile={handleRefreshFile}
                onSave={handleSave}
                onRenameFile={handleRenameFile}
                onDeleteFile={handleDeleteFile}
                onDownloadFile={handleDownloadFile}
                onReplaceFile={handleReplaceFile}
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
