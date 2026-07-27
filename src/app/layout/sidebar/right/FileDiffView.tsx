import React, { useCallback } from "react";
import { t } from "@/shared/i18n";
import { MultiFileDiff } from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";
import { OPEN_PATH_REQUEST_TYPE } from "@/shared/data/desktop/desktopFileSystem";
import { postDesktopHostMessage } from "@/shared/data/desktop/desktopHostBridge";

const FILE_DIFF_EMPTY_CLASS_NAME =
  "right-sidebar-file-diff-empty tw:flex tw:min-h-10 tw:items-center tw:justify-center tw:gap-2 tw:p-2.5 tw:text-xs tw:text-ink-muted";

export const FileDiffView: React.FC<{
  filePath: string;
  original: string;
  current: string;
}> = ({ filePath, original, current }) => {
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

  const handleClickFilePath = useCallback(() => {
    postDesktopHostMessage({
      type: OPEN_PATH_REQUEST_TYPE,
      path: filePath,
    });
  }, [filePath]);

  return (
    <>
      <div
        className="tw:text-xs tw:text-ink-muted tw:font-medium tw:px-[10px] tw:pb-[6px] tw:hover:underline tw:cursor-pointer"
        onClick={handleClickFilePath}
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
