import React, { useCallback } from "react";
import { t } from "@/shared/i18n";
import { MultiFileDiff } from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";
import {
  canUseDesktopFileSystemBridge,
  openDesktopPath,
} from "@/shared/data/desktop/desktopFileSystem";
import { useOptionalAppContext } from "@/app/state/AppContext";

const FILE_DIFF_EMPTY_CLASS_NAME =
  "right-sidebar-file-diff-empty tw:flex tw:min-h-10 tw:items-center tw:justify-center tw:gap-2 tw:p-2.5 tw:text-xs tw:text-ink-muted";
const FILE_DIFF_PATH_CLASS_NAME =
  "tw:text-xs tw:text-ink-muted tw:font-medium tw:px-[10px] tw:pb-[6px]";
const FILE_DIFF_PATH_CLICKABLE_CLASS_NAME =
  "tw:hover:underline tw:cursor-pointer";

export const FileDiffView: React.FC<{
  filePath: string;
  original: string;
  current: string;
}> = ({ filePath, original, current }) => {
  const appContext = useOptionalAppContext();
  const canOpenFilePath = canUseDesktopFileSystemBridge();

  const handleClickFilePath = useCallback(() => {
    const appendDebug = (line: string) => {
      appContext?.dispatch({ type: "APPEND_DEBUG", line });
    };
    void openDesktopPath(filePath)
      .then((opened) => {
        if (!opened) {
          appendDebug(`[file diff] ${t("rightSidebar.overview.fileChanges.openFileUnavailable")}: ${filePath}`);
        }
      })
      .catch((error) => {
        appendDebug(`[file diff open error] ${(error as Error).message}`);
      });
  }, [appContext, filePath]);

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
      <div
        className={
          canOpenFilePath
            ? `${FILE_DIFF_PATH_CLASS_NAME} ${FILE_DIFF_PATH_CLICKABLE_CLASS_NAME}`
            : FILE_DIFF_PATH_CLASS_NAME
        }
        onClick={canOpenFilePath ? handleClickFilePath : undefined}
        title={
          canOpenFilePath
            ? t("rightSidebar.overview.fileChanges.openFile")
            : undefined
        }
      >
        {filePath}
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
