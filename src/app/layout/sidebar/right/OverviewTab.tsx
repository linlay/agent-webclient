import React from "react";
import { useAppState } from "@/app/state/AppContext";
import type { FileChangeSummary, PublishedArtifact } from "@/app/state/types";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { formatAttachmentSize } from "@/features/artifacts/lib/attachmentUtils";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { t } from "@/shared/i18n";

export interface OverviewArtifactItem {
	artifactId: string;
	artifact: PublishedArtifact["artifact"];
	timestamp: number;
}

export function buildOverviewArtifactItems(
	artifacts: PublishedArtifact[],
): OverviewArtifactItem[] {
	return [...artifacts]
		.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
		.map((item) => ({
			artifactId: item.artifactId,
			artifact: item.artifact,
			timestamp: item.timestamp || 0,
		}));
}

export interface OverviewFileChangeItem {
	filePath: string;
	addedLines: number;
	deletedLines: number;
	editedLines: number;
	operationCount: number;
	lastUpdatedAt: number;
}

const FILE_CHANGE_JUMP_DURATION_MS = 560;

export function buildOverviewFileChangeItems(
	fileChanges: FileChangeSummary[],
): OverviewFileChangeItem[] {
	return [...fileChanges]
		.sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0))
		.map((item) => ({
			filePath: item.filePath,
			addedLines: item.addedLines || 0,
			deletedLines: item.deletedLines || 0,
			editedLines: item.editedLines || 0,
			operationCount: item.operationCount || 0,
			lastUpdatedAt: item.lastUpdatedAt || 0,
		}));
}

export function buildFileChangeAnimationSignatures(
	fileChanges: OverviewFileChangeItem[],
): Map<string, string> {
	return new Map(
		fileChanges.map((item) => [
			item.filePath,
			[
				item.addedLines,
				item.deletedLines,
				item.editedLines,
				item.operationCount,
				item.lastUpdatedAt,
			].join(":"),
		]),
	);
}

export function resolveAnimatedFileChangePaths(
	previous: Map<string, string>,
	next: Map<string, string>,
): string[] {
	const changedPaths: string[] = [];
	for (const [filePath, signature] of next.entries()) {
		if (previous.get(filePath) !== signature) {
			changedPaths.push(filePath);
		}
	}
	return changedPaths;
}

function formatLineCount(value: number): string {
	return Math.max(0, value || 0).toLocaleString();
}

function renderFileChangeStats(
	addedLines: number,
	deletedLines: number,
	options: { animated?: boolean; animationKey?: string } = {},
) {
	return (
		<span
			key={options.animationKey}
			className={`right-sidebar-file-change-stats ${options.animated ? "is-jumping" : ""}`.trim()}
		>
			<span className="right-sidebar-file-change-add">
				+{formatLineCount(addedLines)}
			</span>
			<span className="right-sidebar-file-change-delete">
				-{formatLineCount(deletedLines)}
			</span>
		</span>
	);
}

const OverviewSection: React.FC<{
	title: string;
	count: React.ReactNode;
	children: React.ReactNode;
}> = ({ title, count, children }) => {
	return (
		<section className="right-sidebar-overview-section">
			<div className="right-sidebar-overview-section-head">
				<h3>{title}</h3>
				<div className="right-sidebar-overview-section-count">{count}</div>
			</div>
			{children}
		</section>
	);
};

export const OverviewTab: React.FC = () => {
	const state = useAppState();
	const [fileChangeAnimation, setFileChangeAnimation] = React.useState<{
		version: number;
		paths: Set<string>;
		total: boolean;
	}>({
		version: 0,
		paths: new Set(),
		total: false,
	});
	const previousFileChangeSignaturesRef =
		React.useRef<Map<string, string> | null>(null);
	const artifacts = React.useMemo(
		() => buildOverviewArtifactItems(state.artifacts),
		[state.artifacts],
	);
	const fileChanges = React.useMemo(
		() => buildOverviewFileChangeItems(state.fileChanges),
		[state.fileChanges],
	);
	const fileChangeTotals = React.useMemo(
		() =>
			fileChanges.reduce(
				(totals, item) => ({
					addedLines: totals.addedLines + item.addedLines,
					deletedLines: totals.deletedLines + item.deletedLines,
				}),
				{ addedLines: 0, deletedLines: 0 },
			),
		[fileChanges],
	);

	React.useEffect(() => {
		const nextSignatures = buildFileChangeAnimationSignatures(fileChanges);
		const previousSignatures = previousFileChangeSignaturesRef.current;
		previousFileChangeSignaturesRef.current = nextSignatures;

		if (!previousSignatures) {
			return;
		}

		const changedPaths = resolveAnimatedFileChangePaths(
			previousSignatures,
			nextSignatures,
		);
		if (!state.rightSidebarOpen || changedPaths.length === 0) {
			return;
		}

		setFileChangeAnimation((current) => ({
			version: current.version + 1,
			paths: new Set(changedPaths),
			total: true,
		}));

		const timer = window.setTimeout(() => {
			setFileChangeAnimation((current) => ({
				...current,
				paths: new Set(),
				total: false,
			}));
		}, FILE_CHANGE_JUMP_DURATION_MS);

		return () => window.clearTimeout(timer);
	}, [fileChanges, state.rightSidebarOpen]);

	return (
		<div className="right-sidebar-overview">
			<OverviewSection
				title={t("rightSidebar.overview.fileChanges.title")}
				count={renderFileChangeStats(
					fileChangeTotals.addedLines,
					fileChangeTotals.deletedLines,
					{
						animated: fileChangeAnimation.total,
						animationKey: `total-${fileChangeAnimation.version}`,
					},
				)}
			>
				{fileChanges.length === 0 ? (
					<div className="right-sidebar-empty">
						{t("rightSidebar.overview.fileChanges.empty")}
					</div>
				) : (
					<ul className="right-sidebar-file-change-list">
						{fileChanges.map((item) => (
							<li key={item.filePath} className="right-sidebar-file-change-item">
								<MaterialIcon
									name="code"
									className="right-sidebar-file-change-icon"
									aria-hidden="true"
								/>
								<span
									className="right-sidebar-file-change-path"
									title={item.filePath}
								>
									{item.filePath.split('/').pop()}
								</span>
								{renderFileChangeStats(item.addedLines, item.deletedLines, {
									animated: fileChangeAnimation.paths.has(item.filePath),
									animationKey: `${item.filePath}-${fileChangeAnimation.version}`,
								})}
							</li>
						))}
					</ul>
				)}
			</OverviewSection>
			<OverviewSection
				title={t("rightSidebar.overview.artifacts.title")}
				count={artifacts.length}
			>
				{artifacts.length === 0 ? (
					<div className="right-sidebar-empty">
						{t("rightSidebar.overview.artifacts.empty")}
					</div>
				) : (
					<ul className="artifact-drawer-list right-sidebar-artifact-list">
						{artifacts.map((item) => (
							<li key={item.artifactId} className="artifact-drawer-item">
								<AttachmentCard
									attachment={item.artifact}
									variant="composer"
									displayMode="file"
									density="compact"
									subtitle={formatAttachmentSize(item.artifact.sizeBytes)}
								/>
							</li>
						))}
					</ul>
				)}
			</OverviewSection>
		</div>
	);
};
