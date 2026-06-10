import React from "react";
import { t } from "@/shared/i18n";
import { buildLineDiffRows, type FileDiffRow } from "@/app/layout/sidebar/right/fileDiff";

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
			<div className="right-sidebar-file-diff-empty">
				{t("rightSidebar.overview.fileChanges.diffEmpty")}
			</div>
		);
	}

	return (
		<div className="right-sidebar-file-diff" role="table">
			{rows.map((row, index) => (
				<FileDiffLine key={`${index}-${row.type}`} row={row} />
			))}
		</div>
	);
};

const FileDiffLine: React.FC<{ row: FileDiffRow }> = ({ row }) => {
	const marker = row.type === "add" ? "+" : row.type === "delete" ? "-" : " ";
	return (
		<div className={`right-sidebar-file-diff-line is-${row.type}`} role="row">
			<span className="right-sidebar-file-diff-no" role="cell">
				{row.oldLineNumber ?? ""}
			</span>
			<span className="right-sidebar-file-diff-no" role="cell">
				{row.newLineNumber ?? ""}
			</span>
			<span className="right-sidebar-file-diff-marker" role="cell">
				{marker}
			</span>
			<code className="right-sidebar-file-diff-code" role="cell">
				{row.text || " "}
			</code>
		</div>
	);
};
