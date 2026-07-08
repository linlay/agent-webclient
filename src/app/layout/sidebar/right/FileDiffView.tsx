import React from "react";
import { t } from "@/shared/i18n";
import { buildLineDiffRows, type FileDiffRow } from "@/app/layout/sidebar/right/fileDiff";

const FILE_DIFF_EMPTY_CLASS_NAME =
	"right-sidebar-file-diff-empty tw:flex tw:min-h-10 tw:items-center tw:justify-center tw:gap-2 tw:p-2.5 tw:text-xs tw:text-ink-muted";

const FILE_DIFF_CLASS_NAME =
	"right-sidebar-file-diff tw:font-code tw:text-[11px] tw:leading-[1.45] tw:w-fit";

const FILE_DIFF_LINE_CLASS_NAME =
	"right-sidebar-file-diff-line tw:grid tw:min-w-max tw:grid-cols-[38px_38px_18px_minmax(220px,1fr)] tw:items-stretch";

const FILE_DIFF_LINE_TONE_CLASS_NAMES: Record<FileDiffRow["type"], string> = {
	add: "tw:bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] tw:[&_.right-sidebar-file-diff-marker]:text-ok tw:border-l-2 tw:border-[var(--ok)]",
	delete: "tw:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] tw:[&_.right-sidebar-file-diff-marker]:text-danger tw:border-l-2 tw:border-[var(--danger)]",
	context: "",
};

const FILE_DIFF_NUMBER_CLASS_NAME =
	"right-sidebar-file-diff-no tw:select-none tw:px-1.5 tw:py-px tw:text-right tw:text-ink-muted";

const FILE_DIFF_MARKER_CLASS_NAME =
	"right-sidebar-file-diff-marker tw:select-none tw:px-1.5 tw:py-px tw:text-center tw:text-ink-muted";

const FILE_DIFF_CODE_CLASS_NAME =
	"right-sidebar-file-diff-code tw:min-w-0 tw:whitespace-pre tw:bg-transparent tw:py-px tw:pl-1 tw:pr-2.5 tw:text-ink-1";

export const FileDiffView: React.FC<{
	original: string;
	current: string;
}> = ({ original, current }) => {
	const rows = React.useMemo(
		() => buildLineDiffRows(original, current),
		[original, current],
	);

	if (rows.length === 0) {
		return (
			<div className={FILE_DIFF_EMPTY_CLASS_NAME}>
				{t("rightSidebar.overview.fileChanges.diffEmpty")}
			</div>
		);
	}

	return (
		<div className={FILE_DIFF_CLASS_NAME} role="table">
			{rows.map((row, index) => (
				<FileDiffLine key={`${index}-${row.type}`} row={row} />
			))}
		</div>
	);
};

const FileDiffLine: React.FC<{ row: FileDiffRow }> = ({ row }) => {
	const marker = row.type === "add" ? "+" : row.type === "delete" ? "-" : " ";
	const className = [
		FILE_DIFF_LINE_CLASS_NAME,
		FILE_DIFF_LINE_TONE_CLASS_NAMES[row.type],
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div className={className} role="row">
			<span className={FILE_DIFF_NUMBER_CLASS_NAME} role="cell">
				{row.oldLineNumber ?? ""}
			</span>
			<span className={FILE_DIFF_NUMBER_CLASS_NAME} role="cell">
				{row.newLineNumber ?? ""}
			</span>
			<span className={FILE_DIFF_MARKER_CLASS_NAME} role="cell">
				{marker}
			</span>
			<code className={FILE_DIFF_CODE_CLASS_NAME} role="cell">
				{row.text || " "}
			</code>
		</div>
	);
};
