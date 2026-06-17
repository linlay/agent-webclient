import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { FileDiffView } from "@/app/layout/sidebar/right/FileDiffView";
import {
	buildOverviewFileChangeItems,
	getFileIcon,
	renderFileChangeStats,
} from "@/app/layout/sidebar/right/OverviewTab";
import { displayRightSidebarFileName } from "@/app/layout/sidebar/right/rightSidebarTabs";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { t } from "@/shared/i18n";

export const ReviewTab: React.FC = () => {
	const state = useAppState();
	const fileChanges = React.useMemo(
		() => buildOverviewFileChangeItems(state.fileChanges),
		[state.fileChanges],
	);
	const [expandedKeys, setExpandedKeys] = React.useState<Set<string>>(
		() => new Set(fileChanges.map((item) => item.filePath)),
	);

	React.useEffect(() => {
		setExpandedKeys((current) => {
			const next = new Set(current);
			for (const item of fileChanges) {
				next.add(item.filePath);
			}
			return next;
		});
	}, [fileChanges]);

	const allExpanded =
		fileChanges.length > 0 &&
		fileChanges.every((item) => expandedKeys.has(item.filePath));

	return (
		<div className="right-sidebar-review">
			<div className="right-sidebar-review-toolbar">
				<strong>{t("rightSidebar.review.title")}</strong>
				<div className="right-sidebar-review-actions">
					<UiButton
						variant="secondary"
						size="sm"
						iconOnly
						title={
							allExpanded
								? t("rightSidebar.review.actions.collapseAll")
								: t("rightSidebar.review.actions.expandAll")
						}
						aria-label={
							allExpanded
								? t("rightSidebar.review.actions.collapseAll")
								: t("rightSidebar.review.actions.expandAll")
						}
						onClick={() =>
							setExpandedKeys(
								allExpanded
									? new Set()
									: new Set(fileChanges.map((item) => item.filePath)),
							)
						}
					>
						<MaterialIcon
							name={allExpanded ? "unfold_less" : "unfold_more"}
							aria-hidden="true"
						/>
					</UiButton>
				</div>
			</div>
			{fileChanges.length === 0 ? (
				<div className="right-sidebar-empty">
					{t("rightSidebar.review.empty")}
				</div>
			) : (
				<div className="right-sidebar-review-list">
					{fileChanges.map((item) => {
						const snapshot = state.fileContentSnapshots.get(item.filePath);
						const expanded = expandedKeys.has(item.filePath);
						return (
							<section key={`${item.runId}:${item.filePath}`} className="right-sidebar-review-file">
								<button
									type="button"
									className="right-sidebar-review-file-head"
									aria-expanded={expanded}
									onClick={() =>
										setExpandedKeys((current) => {
											const next = new Set(current);
											if (next.has(item.filePath)) {
												next.delete(item.filePath);
											} else {
												next.add(item.filePath);
											}
											return next;
										})
									}
								>
									<MaterialIcon
										name={expanded ? "expand_more" : "chevron_right"}
										aria-hidden="true"
									/>
									<MaterialIcon name={getFileIcon(item.filePath)} aria-hidden="true" />
									<span className="right-sidebar-review-file-name">
										{displayRightSidebarFileName(item.filePath)}
									</span>
									<span className="right-sidebar-review-file-path">
										{item.filePath}
									</span>
									{renderFileChangeStats(item.addedLines, item.deletedLines)}
								</button>
								{expanded ? (
									snapshot ? (
										<FileDiffView
											original={snapshot.originalContent}
											current={snapshot.currentContent}
										/>
									) : (
										<div className="right-sidebar-file-diff-status is-error">
											{t("rightSidebar.overview.fileChanges.diffUnavailable")}
										</div>
									)
								) : null}
							</section>
						);
					})}
				</div>
			)}
		</div>
	);
};
