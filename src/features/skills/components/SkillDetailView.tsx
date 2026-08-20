import { useCallback, useEffect, useMemo, useState } from "react";
import { notification, Spin } from "antd";
import { getAdminSkillDetail, getAdminSource } from "@/shared/data";
import type {
  AdminSkillDetailResponse,
  AdminSkillFileEntry,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { useHighlightCode } from "@/shared/ui/markdown-code/useHighlight";
import "@/shared/ui/markdown-code/highlight-theme.css";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import {
  findPreferredSkillFileEntry,
  iconForEntry,
  isSkillEntryVisible,
  isSkillImageEntry,
  SkillBinaryImagePreview,
} from "@/features/skills/components/SkillConsole";

const SKILL_DETAIL_VIEW_CLASS =
  "skill-detail-view tw:flex  tw:min-h-0 tw:flex-col tw:gap-3 tw:overflow-hidden";
const SKILL_DETAIL_PANELS_CLASS =
  "skill-detail-view-panels tw:grid tw:h-full tw:min-h-0 tw:flex-1 tw:grid-cols-[minmax(200px,260px)_minmax(0,1fr)] tw:gap-1 tw:p-1 tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";
const SKILL_DETAIL_TREE_CLASS =
  "skill-detail-view-tree tw:flex tw:min-h-0 tw:flex-col tw:gap-2 tw:overflow-auto";
const SKILL_DETAIL_CONTENT_CLASS =
  "skill-detail-view-content tw:flex tw:min-h-0 tw:flex-col tw:gap-2 tw:overflow-hidden";
const SKILL_DETAIL_CONTENT_HEAD_CLASS =
  "skill-detail-view-content-head tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2 tw:text-[11px] tw:text-ink-muted";
const SKILL_DETAIL_PATH_CLASS =
  "skill-detail-view-path tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:font-code tw:text-ink-1";
const SKILL_DETAIL_PRE_CLASS =
  "skill-detail-view-pre tw:min-h-0 tw:flex-1 tw:overflow-auto tw:rounded-control tw:border tw:p-3 tw:m-0 tw:font-code tw:text-[12px] tw:leading-[1.5] tw:text-ink-1 tw:[border-color:color-mix(in_srgb,var(--line-soft)_82%,transparent)] tw:[tab-size:2]";
const SKILL_DETAIL_META_CLASS =
  "skill-detail-view-meta tw:flex tw:flex-col tw:gap-3 tw:rounded-control tw:border tw:p-3 tw:text-sm tw:text-ink-1 tw:[border-color:color-mix(in_srgb,var(--line-soft)_82%,transparent)]";
const SKILL_DETAIL_META_GRID_CLASS =
  "skill-detail-view-meta-grid tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:gap-x-3 tw:gap-y-2 tw:text-xs tw:[&>span:nth-child(odd)]:text-ink-muted tw:[&>span:nth-child(even)]:min-w-0 tw:[&>span:nth-child(even)]:overflow-hidden tw:[&>span:nth-child(even)]:text-ellipsis tw:[&>span:nth-child(even)]:whitespace-nowrap";

function formatSize(value: number | undefined): string {
  if (value === undefined || value === null) return "--";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

export const SkillDetailView: React.FC<{ skillKey: string }> = ({
  skillKey,
}) => {
  const { t } = useI18n();

  const [detail, setDetail] = useState<AdminSkillDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileSha256, setFileSha256] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | undefined>(undefined);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(["references", "scripts", "assets"]),
  );

  const applyBinaryEntry = useCallback((entry: AdminSkillFileEntry) => {
    setSelectedFilePath(entry.path);
    setFileContent("");
    setFileSha256(entry.sha256 || null);
    setFileSize(entry.size);
  }, []);

  const loadFileContent = useCallback(async (key: string, path: string) => {
    const normalizedPath = path.trim();
    if (!key || !normalizedPath) return;
    try {
      const response = await getAdminSource({
        type: "skill",
        key,
        path: normalizedPath,
      });
      const data = response.data;
      setSelectedFilePath(data.target.path || normalizedPath);
      setFileContent(data.content);
      setFileSha256(data.sha256 || null);
      setFileSize(data.size);
    } catch (err) {
      notification.error({
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const loadDetail = useCallback(
    async (key: string) => {
      const trimmedKey = key.trim();
      if (!trimmedKey) {
        setDetail(null);
        setLoadError("");
        return;
      }
      setLoading(true);
      setLoadError("");
      try {
        const response = await getAdminSkillDetail(trimmedKey);
        const d = response.data;
        setDetail(d);
        setSelectedFilePath("");
        setFileContent("");
        setFileSha256(null);
        setFileSize(undefined);

        const targetEntry = findPreferredSkillFileEntry(
          d.fileManifest.entries || [],
          "",
          d.fileManifest.defaultOpenPath,
        );
        if (
          d.openedFile &&
          (!targetEntry || d.openedFile.path === targetEntry.path)
        ) {
          setSelectedFilePath(d.openedFile.path);
          setFileContent(d.openedFile.content);
          setFileSha256(d.openedFile.sha256 || null);
          setFileSize(d.openedFile.size);
        } else if (targetEntry?.contentKind === "text") {
          await loadFileContent(d.skill.key, targetEntry.path);
        } else if (targetEntry) {
          applyBinaryEntry(targetEntry);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [applyBinaryEntry, loadFileContent],
  );

  useEffect(() => {
    void loadDetail(skillKey);
  }, [loadDetail, skillKey]);

  const entries = detail?.fileManifest.entries || [];
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.path === selectedFilePath),
    [entries, selectedFilePath],
  );
  const visibleEntries = useMemo(
    () => entries.filter((entry) => isSkillEntryVisible(entry, expandedDirs)),
    [entries, expandedDirs],
  );
  const highlightedHtml = useHighlightCode(
    fileContent,
    selectedEntry?.language || "",
  );

  const handleSelectEntry = useCallback(
    (entry: AdminSkillFileEntry) => {
      if (!detail) return;
      if (entry.kind === "directory") {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          if (next.has(entry.path)) {
            next.delete(entry.path);
          } else {
            next.add(entry.path);
          }
          return next;
        });
        applyBinaryEntry(entry);
        return;
      }
      if (entry.contentKind === "text") {
        void loadFileContent(detail.skill.key, entry.path);
      } else {
        applyBinaryEntry(entry);
      }
    },
    [applyBinaryEntry, detail, loadFileContent],
  );

  if (loading && !detail) {
    return (
      <div className={SKILL_DETAIL_VIEW_CLASS}>
        <div className="command-empty-state">
          <Spin size="small" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={SKILL_DETAIL_VIEW_CLASS}>
        <div className="command-empty-state tw:text-danger">{loadError}</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={SKILL_DETAIL_VIEW_CLASS}>
        <div className="command-empty-state">
          {t("skillConsole.detail.empty")}
        </div>
      </div>
    );
  }

  return (
    <div className={SKILL_DETAIL_PANELS_CLASS}>
      <div className={SKILL_DETAIL_TREE_CLASS}>
        {visibleEntries.length === 0 ? (
          <div className="tw:text-[11px] tw:text-ink-muted tw:p-1">
            {t("skillConsole.fileTree.empty")}
          </div>
        ) : (
          visibleEntries.map((entry) => {
            const isSelected = entry.path === selectedFilePath;
            const paddingLeft = 8 + entry.depth * 16;
            return (
              <button
                key={entry.path}
                type="button"
                className={`tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-1 tw:border-0 tw:bg-transparent tw:py-1 tw:text-left tw:text-[13px] tw:leading-[1.35] tw:text-ink-1 tw:hover:bg-bg-hover ${
                  isSelected ? "tw:bg-bg-selected tw:font-medium" : ""
                }`}
                style={{ paddingLeft, paddingRight: 8 }}
                onClick={() => handleSelectEntry(entry)}
              >
                <MaterialIcon
                  name={iconForEntry(entry, expandedDirs.has(entry.path))}
                />
                <span className="tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
                  {entry.name}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className={SKILL_DETAIL_CONTENT_CLASS}>
        {selectedEntry ? (
          <>
            <div className={SKILL_DETAIL_CONTENT_HEAD_CLASS}>
              <MaterialIcon
                name={iconForEntry(
                  selectedEntry,
                  expandedDirs.has(selectedEntry.path),
                )}
                style={{ fontSize: 16 }}
              />
              <span className={SKILL_DETAIL_PATH_CLASS}>
                {selectedEntry.path}
              </span>
              <span>
                {selectedEntry.contentKind === "directory"
                  ? t("skillConsole.fileTree.directory")
                  : selectedEntry.contentKind === "text"
                    ? selectedEntry.language || "Plain Text"
                    : selectedEntry.mimeType || "Binary"}
              </span>
              {fileSize !== undefined && <span>{formatSize(fileSize)}</span>}
            </div>

            {selectedEntry.contentKind === "text" ? (
              <pre
                className={SKILL_DETAIL_PRE_CLASS}
                dangerouslySetInnerHTML={highlightedHtml}
              />
            ) : (
              <div className={SKILL_DETAIL_META_CLASS}>
                {isSkillImageEntry(selectedEntry) && (
                  <SkillBinaryImagePreview
                    skillKey={detail.skill.key}
                    entry={selectedEntry}
                    t={t}
                  />
                )}
                <strong>{selectedEntry.name}</strong>
                <div className={SKILL_DETAIL_META_GRID_CLASS}>
                  <span>{t("skillConsole.field.path")}</span>
                  <span>{selectedEntry.path}</span>
                  <span>{t("skillConsole.field.size")}</span>
                  <span>{formatSize(selectedEntry.size)}</span>
                  {selectedEntry.mimeType ? (
                    <>
                      <span>{t("skillConsole.field.mime")}</span>
                      <span>{selectedEntry.mimeType}</span>
                    </>
                  ) : null}
                  {fileSha256 || selectedEntry.sha256 ? (
                    <>
                      <span>{t("skillConsole.field.sha256")}</span>
                      <span>{fileSha256 || selectedEntry.sha256 || "--"}</span>
                    </>
                  ) : null}
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
