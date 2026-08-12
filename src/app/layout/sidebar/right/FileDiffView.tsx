import React, { useCallback, useMemo } from "react";
import { t } from "@/shared/i18n";
import { MultiFileDiff } from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";
import {
  canUseDesktopFileSystemBridge,
  openDesktopPath,
} from "@/shared/data/desktop/desktopFileSystem";
import { useOptionalAppContext } from "@/app/state/AppContext";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

const FILE_DIFF_EMPTY_CLASS_NAME =
  "right-sidebar-file-diff-empty tw:flex tw:min-h-10 tw:items-center tw:justify-center tw:gap-2 tw:p-2.5 tw:text-xs tw:text-ink-muted";
const FILE_DIFF_PATH_ROW_CLASS_NAME =
  "right-sidebar-file-diff-path-row tw:flex tw:items-center tw:gap-1 tw:px-[10px] tw:pb-[6px]";
const FILE_DIFF_PATH_TEXT_CLASS_NAME =
  "tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:text-ink-muted tw:font-medium";
const FILE_DIFF_PATH_CLICKABLE_CLASS_NAME =
  "tw:hover:underline tw:cursor-pointer";

function dirname(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash > 0 ? filePath.slice(0, lastSlash) : "";
}

export const FileDiffView: React.FC<{
  filePath: string;
  original: string;
  current: string;
}> = ({ filePath, original, current }) => {
  const appContext = useOptionalAppContext();
  const canOpen = canUseDesktopFileSystemBridge();
  const dirPath = useMemo(() => dirname(filePath), [filePath]);

  const appendDebug = useCallback(
    (line: string) => {
      appContext?.dispatch({ type: "APPEND_DEBUG", line });
    },
    [appContext],
  );

  const handleClickFilePath = useCallback(() => {
    void openDesktopPath(filePath)
      .then((opened) => {
        if (!opened) {
          appendDebug(
            `[file diff] ${t("rightSidebar.overview.fileChanges.openFileUnavailable")}: ${filePath}`,
          );
        }
      })
      .catch((error) => {
        appendDebug(`[file diff open error] ${(error as Error).message}`);
      });
  }, [appendDebug, filePath]);

  const handleOpenFolder = useCallback(() => {
    void openDesktopPath(dirPath)
      .then((opened) => {
        if (!opened) {
          appendDebug(
            `[file diff] ${t("rightSidebar.overview.fileChanges.openFolderUnavailable")}: ${dirPath}`,
          );
        }
      })
      .catch((error) => {
        appendDebug(
          `[file diff open folder error] ${(error as Error).message}`,
        );
      });
  }, [appendDebug, dirPath]);

  const oldFile: FileContents = {
    name: filePath,
    contents: original,
  };
  const newFile: FileContents = {
    name: filePath,
    contents: current,
  };

  if (!original && !current) {
    return (
      <div className={FILE_DIFF_EMPTY_CLASS_NAME}>
        {t("rightSidebar.overview.fileChanges.diffEmpty")}
      </div>
    );
  }

  return (
    <>
      <div className={FILE_DIFF_PATH_ROW_CLASS_NAME}>
        <span
          className={
            canOpen
              ? `${FILE_DIFF_PATH_TEXT_CLASS_NAME} ${FILE_DIFF_PATH_CLICKABLE_CLASS_NAME}`
              : FILE_DIFF_PATH_TEXT_CLASS_NAME
          }
          onClick={canOpen ? handleClickFilePath : undefined}
          title={
            canOpen
              ? t("rightSidebar.overview.fileChanges.openFile")
              : undefined
          }
        >
          {filePath}
        </span>
        {canOpen && dirPath && (
          <UiButton
            className="right-sidebar-file-diff-open-folder ui-icon-hover-20"
            size="mini"
            variant="ghost"
            iconOnly
            onClick={handleOpenFolder}
            aria-label={t("rightSidebar.overview.fileChanges.openFolder")}
            title={t("rightSidebar.overview.fileChanges.openFolder")}
          >
            <MaterialIcon name="folder_open" />
          </UiButton>
        )}
      </div>
      <MultiFileDiff
        oldFile={oldFile}
        newFile={newFile}
        options={{
          diffStyle: "unified",
          disableFileHeader: true,
        }}
        style={
          {
            "--diffs-gap-fallback": 0,
          } as any
        }
      />
    </>
  );
};
