import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input, Modal, Spin } from "antd";
import type { MenuProps } from "antd";
import {
  getAdminSkills,
  getAdminSkillDetail,
  getAdminSkillFile,
  saveAdminSkillFile,
  adminSkillFileOp,
  validateAdminSkill,
  createAdminSkill,
} from "@/shared/data";
import type {
  AdminSkillListItem,
  AdminSkillDetailResponse,
  AdminSkillFileNode,
  AdminSkillFileResponse,
  AdminSkillStatus,
  AdminRegistryDiagnostic,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { formatEpochMillisLocal } from "@/shared/utils/platformTime";

type StatusFilter = "all" | AdminSkillStatus;

const STATUS_FILTERS: StatusFilter[] = ["all", "ready", "invalid", "disabled"];

/* ---- class names ---- */
const SKILL_CONSOLE_CLASS_NAME =
  "skill-console tw:flex tw:flex-auto tw:flex-col tw:min-h-0 tw:gap-3 tw:overflow-hidden";
const SKILL_BODY_CLASS_NAME =
  "skill-console-body tw:grid tw:min-h-0 tw:flex-auto tw:grid-cols-[minmax(280px,0.52fr)_minmax(480px,1.55fr)] tw:gap-4 tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";
const SKILL_LIST_CLASS_NAME =
  "skill-console-list tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:max-h-[260px]";
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
const SKILL_LIST_ITEM_TITLE_CLASS_NAME =
  "skill-console-list-item-title tw:inline-flex tw:min-w-0 tw:flex-1 tw:items-baseline tw:gap-[5px] tw:overflow-hidden tw:whitespace-nowrap tw:[&>strong]:min-w-0 tw:[&>strong]:overflow-hidden tw:[&>strong]:text-ellipsis tw:[&>strong]:text-[13px] tw:[&>strong]:leading-[1.35]";
const SKILL_LIST_ITEM_META_CLASS_NAME =
  "skill-console-list-item-meta tw:flex tw:min-w-0 tw:items-center tw:gap-1.5 tw:overflow-hidden tw:text-[11px] tw:leading-[1.35] tw:text-ink-muted";
const SKILL_COUNT_CLASS_NAME =
  "skill-console-count tw:text-xs tw:text-ink-muted";
const SKILL_DETAIL_CLASS_NAME =
  "skill-console-detail tw:min-h-0 tw:min-w-0 tw:overflow-auto";
const SKILL_DETAIL_HEAD_CLASS_NAME =
  "skill-console-detail-head tw:mb-3.5 tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&>div:first-child]:flex tw:[&>div:first-child]:min-w-0 tw:[&>div:first-child]:flex-col tw:[&>div:first-child]:gap-1 tw:[&_strong]:text-sm tw:[&_span]:[overflow-wrap:anywhere] tw:[&_span]:text-[11px] tw:[&_span]:text-ink-muted";
const SKILL_DETAIL_ACTIONS_CLASS_NAME =
  "skill-console-detail-actions tw:flex tw:flex-wrap tw:items-center tw:gap-2";
const SKILL_META_GRID_CLASS_NAME =
  "skill-console-meta-grid tw:mb-3 tw:grid tw:grid-cols-2 tw:gap-2 tw:text-[11px] tw:text-ink-muted tw:max-[860px]:grid-cols-1 tw:[&>span]:min-w-0 tw:[&>span]:[overflow-wrap:anywhere]";
const SKILL_DIAGNOSTICS_CLASS_NAME =
  "skill-console-diagnostics tw:mb-3.5 tw:rounded-control tw:border tw:p-3 tw:[border-color:color-mix(in_srgb,var(--accent-danger)_28%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_5%,transparent)]";
const SKILL_DIAGNOSTIC_ROW_CLASS_NAME =
  "skill-console-diagnostic-row tw:grid tw:grid-cols-[auto_auto_minmax(0,1fr)] tw:items-center tw:gap-2 tw:py-[5px] tw:text-xs tw:[&+&]:border-t tw:[&+&]:[border-color:color-mix(in_srgb,var(--line-soft)_72%,transparent)] tw:[&>strong]:text-[11px] tw:[&>strong]:text-accent-danger tw:[&>span:last-child]:min-w-0 tw:[&>span:last-child]:[overflow-wrap:anywhere] tw:[&>span:last-child]:text-ink-2";
const SKILL_FILE_PANELS_CLASS_NAME =
  "skill-console-file-panels tw:mt-3 tw:grid tw:min-h-0 tw:grid-cols-[minmax(180px,0.35fr)_minmax(320px,1.3fr)] tw:gap-4 tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-visible";
const SKILL_FILE_TREE_CLASS_NAME =
  "skill-console-file-tree tw:min-h-0 tw:overflow-auto tw:rounded-control tw:border tw:p-1.5 tw:[border-color:color-mix(in_srgb,var(--line-soft)_82%,transparent)] tw:max-[860px]:max-h-[220px]";
const SKILL_FILE_EDITOR_CLASS_NAME =
  "skill-console-file-editor tw:flex tw:min-h-0 tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:overflow-visible";
const SKILL_FILE_EDITOR_HEAD_CLASS_NAME =
  "skill-console-file-editor-head tw:flex tw:min-w-0 tw:items-center tw:gap-2 tw:text-[11px] tw:text-ink-muted";
const SKILL_FILE_EDITOR_HEAD_PATH_CLASS_NAME =
  "skill-console-file-editor-head-path tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:font-code tw:text-ink-1";
const SKILL_TEXTAREA_CLASS_NAME =
  "skill-console-textarea tw:min-h-[420px] tw:resize-y tw:font-code tw:leading-[1.5] tw:[tab-size:2] tw:max-[860px]:min-h-80";
const SKILL_DIRTY_CLASS_NAME =
  "skill-console-dirty tw:text-xs tw:text-ink-muted";
const SKILL_ERROR_CLASS_NAME =
  "skill-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";
const SKILL_MESSAGE_CLASS_NAME =
  "skill-console-message tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1 tw:[border-color:color-mix(in_srgb,var(--accent-electric)_28%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-electric)_7%,transparent)]";

/* ---- helpers ---- */

function statusTone(status: AdminSkillStatus): "accent" | "danger" | "muted" {
  if (status === "invalid") return "danger";
  if (status === "disabled") return "muted";
  return "accent";
}

function formatTimestamp(value: number | undefined, locale: string): string {
  return formatEpochMillisLocal(value, locale);
}

function formatSize(value: number | undefined): string {
  if (value === undefined || value === null) return "--";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "md": return "Markdown";
    case "py": return "Python";
    case "ts": return "TypeScript";
    case "tsx": return "TSX";
    case "js": return "JavaScript";
    case "jsx": return "JSX";
    case "json": return "JSON";
    case "yaml": case "yml": return "YAML";
    case "sh": case "bash": return "Shell";
    case "toml": return "TOML";
    case "env": return "Env";
    case "css": return "CSS";
    default: return ext ? ext.toUpperCase() : "Plain Text";
  }
}

function isFilePathSafe(rawPath: string): boolean {
  const trimmed = rawPath.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return false;
  if (trimmed.includes("..")) return false;
  // reject backslash as path separator for cross-platform safety
  if (trimmed.includes("\\")) return false;
  return true;
}

function normalizeSkillList(data: unknown): AdminSkillListItem[] {
  if (Array.isArray(data)) return data as AdminSkillListItem[];
  if (data && typeof data === "object" && "items" in data) {
    return (data as { items: AdminSkillListItem[] }).items || [];
  }
  return [];
}

function flattenFileNodes(nodes: AdminSkillFileNode[]): AdminSkillFileNode[] {
  const result: AdminSkillFileNode[] = [];
  const stack = [...nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node);
    if (node.children && node.children.length > 0) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
  return result;
}

function findFileNodeByPath(nodes: AdminSkillFileNode[], path: string): AdminSkillFileNode | undefined {
  const normalizedPath = path.trim();
  if (!normalizedPath) return undefined;
  return flattenFileNodes(nodes).find((node) => node.path === normalizedPath);
}

function findFileNodeByName(nodes: AdminSkillFileNode[], name: string): AdminSkillFileNode | undefined {
  return flattenFileNodes(nodes).find((node) => node.name === name && node.type === "file");
}

function findFirstFileNode(nodes: AdminSkillFileNode[]): AdminSkillFileNode | undefined {
  return flattenFileNodes(nodes).find((node) => node.type === "file");
}

export function findPreferredSkillFileNode(
  nodes: AdminSkillFileNode[],
  preferredPath = "",
): AdminSkillFileNode | undefined {
  const preferred = findFileNodeByPath(nodes, preferredPath);
  if (preferred?.type === "file") return preferred;
  return findFileNodeByName(nodes, "SKILL.md") || findFirstFileNode(nodes);
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

export function toggleSkillExpandedDir(current: Set<string>, path: string): Set<string> {
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
  const { t, locale } = useI18n();

  /* ---- list state ---- */
  const [skills, setSkills] = useState<AdminSkillListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  /* ---- detail state ---- */
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<AdminSkillDetailResponse | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [originalFileContent, setOriginalFileContent] = useState("");
  const [fileRevision, setFileRevision] = useState<string | null>(null);
  const [fileMtime, setFileMtime] = useState<number | undefined>(undefined);
  const [fileSize, setFileSize] = useState<number | undefined>(undefined);
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());

  /* ---- action state ---- */
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["references", "scripts"]));

  const detailRef = useRef<AdminSkillDetailResponse | null>(null);
  detailRef.current = detail;

  /* ---- derived ---- */
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
        item.sourcePath || "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [skills, searchText, statusFilter]);

  /* ---- API calls ---- */

  const loadSkills = useCallback(async () => {
    setListLoading(true);
    setError("");
    try {
      const response = await getAdminSkills();
      setSkills(normalizeSkillList(response.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadFileByPath = useCallback(async (skillKey: string, path: string) => {
    const normalizedPath = path.trim();
    if (!skillKey || !normalizedPath) return null;
    setSelectedFilePath(normalizedPath);
    setError("");
    try {
      const response = await getAdminSkillFile(skillKey, normalizedPath);
      const fileData: AdminSkillFileResponse = response.data;
      setFileContent(fileData.content);
      setOriginalFileContent(fileData.content);
      setFileRevision(fileData.revision || null);
      setFileMtime(fileData.mtime);
      setFileSize(fileData.size);
      return fileData;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const clearFileState = useCallback(() => {
    setSelectedFilePath("");
    setFileContent("");
    setOriginalFileContent("");
    setFileRevision(null);
    setFileMtime(undefined);
    setFileSize(undefined);
  }, []);

  const refreshDetailOnly = useCallback(async (skillKey: string) => {
    const response = await getAdminSkillDetail(skillKey);
    const nextDetail = response.data;
    setDetail(nextDetail);
    detailRef.current = nextDetail;
    return nextDetail;
  }, []);

  const loadDetail = useCallback(
    async (skillKey: string, preferredFilePath = "") => {
      const normalizedSkillKey = skillKey.trim();
      if (!normalizedSkillKey) return;
      setDetailLoading(true);
      setError("");
      try {
        const response = await getAdminSkillDetail(normalizedSkillKey);
        const d = response.data;
        setDetail(d);
        detailRef.current = d;

        clearFileState();
        setDirtyFiles(new Set());

        const targetFile = findPreferredSkillFileNode(d.fileTree || [], preferredFilePath);
        if (targetFile) {
          await loadFileByPath(d.key, targetFile.path);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [clearFileState, loadFileByPath],
  );

  const selectFileNode = useCallback(
    async (node: AdminSkillFileNode) => {
      const currentDetail = detailRef.current;
      if (!currentDetail) return;

      if (node.type === "directory") {
        setExpandedDirs((prev) => toggleSkillExpandedDir(prev, node.path));
        return;
      }

      // Check for unsaved changes
      if (isFileDirty && selectedFilePath !== node.path) {
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

      await loadFileByPath(currentDetail.key, node.path);
    },
    [isFileDirty, loadFileByPath, selectedFilePath, t],
  );

  /* ---- initial load & URL selection ---- */
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
    // Auto-select first ready skill
    const firstReady = skills.find((s) => s.status === "ready");
    if (firstReady) {
      onSelectSkillKey(firstReady.key);
    }
  }, [onSelectSkillKey, selectedSkillKey, skills]);

  /* ---- handlers ---- */

  const handleSelectSkill = (item: AdminSkillListItem) => {
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

  const handleRefresh = () => {
    if (detail) {
      void loadDetail(detail.key);
    }
  };

  const handleSave = async () => {
    if (!detail || !selectedFilePath || !isFileDirty) return;
    setSaving(true);
    setError("");
    try {
      const response = await saveAdminSkillFile({
        skillKey: detail.key,
        path: selectedFilePath,
        content: fileContent,
        baseRevision: fileRevision || undefined,
      });
      const saved: AdminSkillFileResponse = response.data;
      setFileContent(saved.content);
      setOriginalFileContent(saved.content);
      setFileRevision(saved.revision || null);
      setFileMtime(saved.mtime);
      setFileSize(saved.size);
      setDirtyFiles((prev) => {
        const next = new Set(prev);
        next.delete(selectedFilePath);
        return next;
      });
      setMessage(t("skillConsole.message.saveSuccess"));
      await refreshDetailOnly(detail.key);
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
      const response = await validateAdminSkill(detail.key);
      const result = response.data;
      await refreshDetailOnly(detail.key);

      if (result.status === "invalid") {
        setMessage(t("skillConsole.message.validateInvalid", { count: result.diagnostics?.length || 0 }));
      } else {
        setMessage(t("skillConsole.message.validateSuccess"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setValidating(false);
    }
  };

  const handleFileOp = async (
    op: "create-file" | "create-dir" | "rename" | "delete",
    path: string,
    newPath?: string,
    preferredFilePath?: string,
  ) => {
    if (!detail) return;
    setError("");
    try {
      await adminSkillFileOp({
        skillKey: detail.key,
        op,
        path,
        newPath,
      });
      if (op === "create-dir") {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(path);
          return next;
        });
      }
      await loadDetail(detail.key, preferredFilePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
          onChange={(e) => { inputValue = e.target.value; }}
        />
      ),
      onOk: async () => {
        const name = inputValue.trim();
        if (!name || !isFilePathSafe(name)) return;
        await handleFileOp("create-file", name, undefined, name);
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
          onChange={(e) => { inputValue = e.target.value; }}
        />
      ),
      onOk: async () => {
        const name = inputValue.trim();
        if (!name || !isFilePathSafe(name)) return;
        await handleFileOp("create-dir", name, undefined, selectedFilePath);
      },
    });
  };

  const handleRenameFile = () => {
    if (!detail || !selectedFilePath) return;
    let inputValue = selectedFilePath;
    Modal.confirm({
      title: t("skillConsole.fileOp.rename"),
      content: (
        <Input
          autoFocus
          defaultValue={selectedFilePath}
          onChange={(e) => { inputValue = e.target.value; }}
        />
      ),
      onOk: async () => {
        const newPath = inputValue.trim();
        if (!newPath || !isFilePathSafe(newPath) || newPath === selectedFilePath) return;
        await handleFileOp("rename", selectedFilePath, newPath, newPath);
      },
    });
  };

  const handleDeleteFile = () => {
    if (!detail || !selectedFilePath) return;
    Modal.confirm({
      title: t("skillConsole.fileOp.deleteConfirm", { type: t("skillConsole.fileTree.root"), name: selectedFilePath }),
      okButtonProps: { danger: true },
      onOk: async () => {
        await handleFileOp("delete", selectedFilePath);
      },
    });
  };

  const handleCreateSkill = () => {
    let inputKey = "";
    let inputName = "";
    Modal.confirm({
      title: t("skillConsole.create.title"),
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <Input
            placeholder="skill-key"
            onChange={(e) => { inputKey = e.target.value; }}
          />
          <Input
            placeholder={t("skillConsole.field.name")}
            onChange={(e) => { inputName = e.target.value; }}
          />
          <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>
            {t("skillConsole.create.description")}
          </div>
        </div>
      ),
      onOk: async () => {
        const key = inputKey.trim();
        const name = inputName.trim() || key;
        if (!key) return;
        setCreating(true);
        try {
          const response = await createAdminSkill({ key, name });
          setSkills((prev) => [...prev, response.data].sort((a, b) => a.key.localeCompare(b.key)));
          onSelectSkillKey(key);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setCreating(false);
        }
      },
    });
  };

  const handleFileChange = (value: string) => {
    setFileContent(value);
    setDirtyFiles((prev) =>
      updateSkillDirtyFiles(prev, selectedFilePath, value, originalFileContent),
    );
    setMessage("");
  };

  /* ---- file tree rendering ---- */

  const renderFileNode = (node: AdminSkillFileNode, depth: number = 0): React.ReactNode => {
    const isDir = node.type === "directory";
    const isExpanded = expandedDirs.has(node.path);
    const isSelected = node.path === selectedFilePath;
    const isDirty = dirtyFiles.has(node.path);
    const iconName = isDir ? "folder_open" : "description";
    const paddingLeft = 8 + depth * 16;

    return (
      <div key={node.path}>
        <button
          type="button"
          className={`tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-1 tw:border-0 tw:bg-transparent tw:py-1 tw:text-left tw:text-[13px] tw:leading-[1.35] tw:text-ink-1 tw:hover:bg-bg-hover ${
            isSelected ? "tw:bg-bg-hover tw:font-medium" : ""
          }`}
          style={{ paddingLeft, paddingRight: 8 }}
          onClick={() => selectFileNode(node)}
        >
          <MaterialIcon name={iconName as "description"} />
          <span className="tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
            {node.name}
          </span>
          {isDirty && (
            <span
              className="tw:inline-block tw:h-2 tw:w-2 tw:flex-none tw:rounded-full"
              style={{ backgroundColor: "var(--accent-warning, #ff7d00)" }}
              title={t("skillConsole.message.unsaved")}
            />
          )}
        </button>
        {isDir && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  /* ---- status filter menu ---- */

  const statusMenu: MenuProps = useMemo(
    () => ({
      onClick: (info) => setStatusFilter(info.key as StatusFilter),
      selectedKeys: [statusFilter],
      items: STATUS_FILTERS.map((status) => ({
        key: status,
        label: t(`skillConsole.statusFilter.${status}`),
      })),
    }),
    [t, statusFilter],
  );

  /* ---- file-level diagnostics ---- */
  const fileDiagnostics = useMemo(() => {
    if (!detail?.diagnostics || !selectedFilePath) return [];
    return detail.diagnostics.filter((d) => {
      if (!d.sourcePath) return false;
      return d.sourcePath === selectedFilePath || d.sourcePath.endsWith("/" + selectedFilePath);
    });
  }, [detail?.diagnostics, selectedFilePath]);

  const skillLevelDiagnostics = useMemo(() => {
    if (!detail?.diagnostics) return [];
    return detail.diagnostics.filter((d) => !d.sourcePath);
  }, [detail?.diagnostics]);

  return (
    <div className={SKILL_CONSOLE_CLASS_NAME}>
      {error && (
        <div className={SKILL_ERROR_CLASS_NAME}>
          <span>{error}</span>
          <UiButton size="sm" variant="ghost" onClick={loadSkills}>
            {t("skillConsole.action.retry")}
          </UiButton>
        </div>
      )}

      {message && !error && (
        <div className={SKILL_MESSAGE_CLASS_NAME}>{message}</div>
      )}

      <div className={SKILL_BODY_CLASS_NAME}>
        {/* ---- left list ---- */}
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
              onClick={handleCreateSkill}
              disabled={creating}
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
                  {searchText ? t("skillConsole.message.noMatch") : t("skillConsole.empty")}
                  {!searchText && (
                    <UiButton size="sm" variant="primary" onClick={handleCreateSkill} disabled={creating}>
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
                        <span className={SKILL_LIST_ITEM_TITLE_CLASS_NAME}>
                          <strong>{item.name || item.key}</strong>
                        </span>
                        <UiTag tone={statusTone(item.status)}>
                          {t(`skillConsole.status.${item.status}`)}
                        </UiTag>
                      </span>
                      <span className={SKILL_LIST_ITEM_META_CLASS_NAME}>
                        <span className="tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
                          {item.key}
                          {item.sourcePath ? ` · ${item.sourcePath}` : ""}
                          {item.fileCount !== undefined ? ` · ${item.fileCount} ${t("skillConsole.field.fileCount")}` : ""}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Spin>
          </div>
        </div>

        {/* ---- right detail ---- */}
        <div className={SKILL_DETAIL_CLASS_NAME}>
          <Spin spinning={detailLoading}>
            {!detail ? (
              <div className="command-empty-state">{t("skillConsole.detail.empty")}</div>
            ) : (
              <>
                {/* detail head */}
                <div className={SKILL_DETAIL_HEAD_CLASS_NAME}>
                  <div>
                    <strong>{detail.name || detail.key}</strong>
                    <span>{detail.sourcePath || detail.key}</span>
                  </div>
                  <div className={SKILL_DETAIL_ACTIONS_CLASS_NAME}>
                    <UiTag tone={statusTone(detail.status)}>
                      {t(`skillConsole.status.${detail.status}`)}
                    </UiTag>
                    <UiButton size="sm" variant="ghost" onClick={handleRefresh}>
                      <MaterialIcon name="refresh" />
                      <span>{t("skillConsole.action.refresh")}</span>
                    </UiButton>
                    <UiButton
                      size="sm"
                      variant="ghost"
                      onClick={handleValidate}
                      disabled={validating}
                    >
                      <MaterialIcon name="rule" />
                      <span>{t("skillConsole.action.validate")}</span>
                    </UiButton>
                    <UiButton
                      size="sm"
                      variant="primary"
                      onClick={handleSave}
                      disabled={saving || !isFileDirty}
                    >
                      <MaterialIcon name="save" />
                      <span>{t("skillConsole.action.save")}</span>
                    </UiButton>
                    <UiButton
                      size="sm"
                      variant="ghost"
                      onClick={handleCreateFile}
                    >
                      <MaterialIcon name="article" />
                      <span>{t("skillConsole.action.createFile")}</span>
                    </UiButton>
                    <UiButton
                      size="sm"
                      variant="ghost"
                      onClick={handleCreateDir}
                    >
                      <MaterialIcon name="create_new_folder" />
                      <span>{t("skillConsole.action.createDir")}</span>
                    </UiButton>
                  </div>
                </div>

                {/* meta grid */}
                <div className={SKILL_META_GRID_CLASS_NAME}>
                  <span>{t("skillConsole.field.key")}: {detail.key}</span>
                  <span>{t("skillConsole.field.name")}: {detail.name || "--"}</span>
                  <span>{t("skillConsole.field.path")}: {detail.sourcePath || "--"}</span>
                  <span>{t("skillConsole.field.status")}: {t(`skillConsole.status.${detail.status}`)}</span>
                  <span>{t("skillConsole.field.fileCount")}: {detail.fileTree?.length || 0}</span>
                  <span>{t("skillConsole.field.updatedAt")}: {formatTimestamp(detail.updatedAt, locale)}</span>
                </div>

                {/* skill-level diagnostics */}
                {skillLevelDiagnostics.length > 0 && (
                  <fieldset className={SKILL_DIAGNOSTICS_CLASS_NAME}>
                    <legend className="tw:px-1.5 tw:text-[11px] tw:font-bold tw:text-ink-muted">
                      {t("skillConsole.diagnostics.title")}
                    </legend>
                    {skillLevelDiagnostics.map((item, index) => (
                      <div className={SKILL_DIAGNOSTIC_ROW_CLASS_NAME} key={`${item.code}-${index}`}>
                        <UiTag tone={item.severity === "error" ? "danger" : "muted"}>{item.severity}</UiTag>
                        <strong>{item.code}</strong>
                        <span>{item.message}</span>
                      </div>
                    ))}
                  </fieldset>
                )}

                {/* file panels: tree + editor */}
                <div className={SKILL_FILE_PANELS_CLASS_NAME}>
                  {/* file tree */}
                  <div className={SKILL_FILE_TREE_CLASS_NAME}>
                    {detail.fileTree && detail.fileTree.length > 0 ? (
                      detail.fileTree.map((node) => renderFileNode(node))
                    ) : (
                      <div className="tw:text-[11px] tw:text-ink-muted tw:p-1">
                        {t("skillConsole.fileTree.empty")}
                      </div>
                    )}
                  </div>

                  {/* file editor */}
                  <div className={SKILL_FILE_EDITOR_CLASS_NAME}>
                    {selectedFilePath ? (
                      <>
                        {/* editor head */}
                        <div className={SKILL_FILE_EDITOR_HEAD_CLASS_NAME}>
                          <MaterialIcon name="description" />
                          <span className={SKILL_FILE_EDITOR_HEAD_PATH_CLASS_NAME}>
                            {selectedFilePath}
                          </span>
                          <span>{getLanguageFromPath(selectedFilePath)}</span>
                          {fileSize !== undefined && <span>{formatSize(fileSize)}</span>}
                        </div>

                        {/* file-level diagnostics */}
                        {fileDiagnostics.length > 0 && (
                          <fieldset className={SKILL_DIAGNOSTICS_CLASS_NAME}>
                            <legend className="tw:px-1.5 tw:text-[11px] tw:font-bold tw:text-ink-muted">
                              {t("skillConsole.diagnostics.fileTitle")}
                            </legend>
                            {fileDiagnostics.map((item, index) => (
                              <div className={SKILL_DIAGNOSTIC_ROW_CLASS_NAME} key={`file-${item.code}-${index}`}>
                                <UiTag tone={item.severity === "error" ? "danger" : "muted"}>{item.severity}</UiTag>
                                <strong>{item.code}</strong>
                                <span>{item.message}</span>
                              </div>
                            ))}
                          </fieldset>
                        )}

                        {/* textarea */}
                        <Input.TextArea
                          className={SKILL_TEXTAREA_CLASS_NAME}
                          value={fileContent}
                          onChange={(e) => handleFileChange(e.target.value)}
                        />

                        {/* file actions bar */}
                        <div className={SKILL_DETAIL_ACTIONS_CLASS_NAME}>
                          {isFileDirty && (
                            <span className={SKILL_DIRTY_CLASS_NAME}>
                              {t("skillConsole.message.unsaved")}
                            </span>
                          )}
                          <UiButton size="sm" variant="ghost" onClick={handleRenameFile}>
                            <MaterialIcon name="edit" />
                            <span>{t("skillConsole.action.rename")}</span>
                          </UiButton>
                          <UiButton size="sm" variant="ghost" onClick={handleDeleteFile}>
                            <MaterialIcon name="delete" />
                            <span>{t("skillConsole.action.delete")}</span>
                          </UiButton>
                        </div>
                      </>
                    ) : (
                      <div className="command-empty-state">
                        {t("skillConsole.fileTree.empty")}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </Spin>
        </div>
      </div>
    </div>
  );
};
