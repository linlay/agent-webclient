import React from "react";
import ReactDiffViewer from "react-diff-viewer-continued";
import { t } from "@/shared/i18n";

export const FileDiffView: React.FC<{
	original: string;
	current: string;
	mode?: "split" | "stacked";
}> = ({ original, current, mode = "split" }) => {
	const hasDiff = original !== current;

	if (!hasDiff) {
		return (
			<div className="right-sidebar-file-diff-empty">
				{t("rightSidebar.overview.fileChanges.diffEmpty")}
			</div>
		);
	}

	return (
		<div className={`right-sidebar-file-diff is-${mode}`}>
			<ReactDiffViewer
				oldValue={original}
				newValue={current}
				splitView={mode === "split"}
				showDiffOnly
				leftTitle={t("rightSidebar.diff.original")}
				rightTitle={t("rightSidebar.diff.current")}
				styles={{
					variables: {
						light: {
							diffViewerBackground: "transparent",
							diffViewerColor: "var(--ink)",
							addedBackground: "color-mix(in srgb, var(--ok) 10%, transparent)",
							addedColor: "var(--ink)",
							removedBackground: "color-mix(in srgb, var(--danger) 10%, transparent)",
							removedColor: "var(--ink)",
							wordAddedBackground: "color-mix(in srgb, var(--ok) 24%, transparent)",
							wordRemovedBackground: "color-mix(in srgb, var(--danger) 20%, transparent)",
							gutterBackground: "transparent",
							gutterBackgroundDark: "transparent",
							highlightBackground: "color-mix(in srgb, var(--accent-electric) 10%, transparent)",
							highlightGutterBackground: "transparent",
							codeFoldGutterBackground: "transparent",
							codeFoldBackground: "color-mix(in srgb, var(--bg-surface-2) 80%, transparent)",
						},
					},
					diffContainer: {
						fontFamily: '"IBM Plex Mono", monospace',
						fontSize: "11px",
						lineHeight: "1.45",
					},
					line: {
						minHeight: "20px",
					},
				}}
			/>
		</div>
	);
};
