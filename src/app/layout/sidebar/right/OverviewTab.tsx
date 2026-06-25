import React from "react";
import { useAppState } from "@/app/state/AppContext";
import type { FileChangeSummary, PublishedArtifact } from "@/app/state/types";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { formatAttachmentSize } from "@/features/artifacts/lib/attachmentUtils";
import { FileDiffView } from "@/app/layout/sidebar/right/FileDiffView";
import { getFileHistory } from "@/shared/api/apiClient";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { t } from "@/shared/i18n";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";

export function getFileIcon(filePath: string): MaterialIconName {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	const map: Record<string, MaterialIconName> = {
		ts: "code",
		tsx: "code",
		js: "javascript",
		jsx: "javascript",
		mjs: "javascript",
		cjs: "javascript",
		css: "css",
		scss: "css",
		sass: "css",
		less: "css",
		html: "html",
		htm: "html",
		json: "data_object",
		md: "description",
		mdx: "description",
		py: "code",
		java: "code",
		go: "code",
		rs: "code",
		sh: "terminal",
		bash: "terminal",
		zsh: "terminal",
		yaml: "description",
		yml: "description",
		toml: "settings",
		xml: "code",
		svg: "image",
		png: "image",
		jpg: "image",
		jpeg: "image",
		gif: "image",
		webp: "image",
		ico: "image",
		txt: "description",
		lock: "lock",
		env: "settings",
		properties: "settings",
	};
	return map[ext] ?? "description";
}

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
	runId: string;
	filePath: string;
	addedLines: number;
	deletedLines: number;
	editedLines: number;
	operationCount: number;
	lastUpdatedAt: number;
}

const FILE_CHANGE_JUMP_DURATION_MS = 560;

export type FileHistoryCacheEntry =
	| { status: "loading" }
	| { status: "loaded"; original: string; current: string }
	| { status: "error" };

type FileHistoryCache = Record<string, FileHistoryCacheEntry>;
type FileHistoryCacheUpdater = (
	update: (current: FileHistoryCache) => FileHistoryCache,
) => void;
type FileHistoryFetcher = typeof getFileHistory;

export async function loadFileHistoryForCache(params: {
	chatId: string;
	item: Pick<OverviewFileChangeItem, "runId" | "filePath">;
	cache: FileHistoryCache;
	updateCache: FileHistoryCacheUpdater;
	fetchHistory?: FileHistoryFetcher;
}): Promise<"loaded" | "error" | "skipped"> {
	const { chatId, item, cache, updateCache, fetchHistory = getFileHistory } = params;
	const cacheKey = buildFileHistoryCacheKey(chatId, item);
	if (!chatId || !item.runId || !item.filePath) {
		updateCache((current) => ({
			...current,
			[cacheKey]: { status: "error" },
		}));
		return "error";
	}
	const existing = cache[cacheKey];
	if (existing && existing.status !== "error") {
		return "skipped";
	}
	updateCache((current) => ({
		...current,
		[cacheKey]: { status: "loading" },
	}));
	try {
		const [original, current] = await Promise.all([
			fetchHistory({
				chatId,
				runId: item.runId,
				filePath: item.filePath,
				version: "original",
			}),
			fetchHistory({
				chatId,
				runId: item.runId,
				filePath: item.filePath,
				version: "current",
			}),
		]);
		updateCache((nextCache) => ({
			...nextCache,
			[cacheKey]: {
				status: "loaded",
				original: original.data.content || "",
				current: current.data.content || "",
			},
		}));
		return "loaded";
	} catch {
		updateCache((current) => ({
			...current,
			[cacheKey]: { status: "error" },
		}));
		return "error";
	}
}

export function buildFileChangeKey(runId: string, filePath: string): string {
	return `${runId}\u0000${filePath}`;
}

export function buildFileHistoryCacheKey(
	chatId: string,
	item: Pick<OverviewFileChangeItem, "runId" | "filePath">,
): string {
	return `${chatId}\u0000${item.runId}\u0000${item.filePath}`;
}

export function buildOverviewFileChangeItems(
	fileChanges: FileChangeSummary[],
): OverviewFileChangeItem[] {
	return [...fileChanges]
		.sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0))
		.map((item) => ({
			runId: item.runId || "",
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
			buildFileChangeKey(item.runId, item.filePath),
			[
				item.runId,
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

function displayFileName(filePath: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	return normalized.split("/").pop() || filePath;
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

function renderFileHistoryPanel(entry: FileHistoryCacheEntry | undefined) {
	if (!entry || entry.status === "loading") {
		return (
			<div className="right-sidebar-file-diff-status">
				<span className="right-sidebar-file-diff-spinner" aria-hidden="true" />
				{t("rightSidebar.overview.fileChanges.diffLoading")}
			</div>
		);
	}
	if (entry.status === "error") {
		return (
			<div className="right-sidebar-file-diff-status is-error">
				{t("rightSidebar.overview.fileChanges.diffUnavailable")}
			</div>
		);
	}
	return <FileDiffView original={entry.original} current={entry.current} />;
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
	const [expandedFileChangeKeys, setExpandedFileChangeKeys] = React.useState<
		Set<string>
	>(new Set());
	const [fileHistoryCache, setFileHistoryCache] = React.useState<
		FileHistoryCache
	>({});
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
	const isCoder = React.useMemo(() => {
		const worker = resolveCurrentWorkerSummary(state);
		if (!worker || worker.type !== "agent") return false;
		return String((worker.raw as Record<string, unknown> | null)?.["mode"] || "").toUpperCase() === "CODER";
	}, [state]);

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

	const loadFileHistory = React.useCallback(
		(item: OverviewFileChangeItem) => {
			void loadFileHistoryForCache({
				chatId: state.chatId,
				item,
				cache: fileHistoryCache,
				updateCache: setFileHistoryCache,
			});
		},
		[fileHistoryCache, state.chatId],
	);

	const toggleFileChange = React.useCallback(
		(item: OverviewFileChangeItem) => {
			const itemKey = buildFileChangeKey(item.runId, item.filePath);
			const expanding = !expandedFileChangeKeys.has(itemKey);
			setExpandedFileChangeKeys((current) => {
				const next = new Set(current);
				if (next.has(itemKey)) {
					next.delete(itemKey);
				} else {
					next.add(itemKey);
				}
				return next;
			});
			if (expanding) {
				loadFileHistory(item);
			}
		},
		[expandedFileChangeKeys, loadFileHistory],
	);

	return (
		<div className="right-sidebar-overview">
			<OverviewSection
				title={isCoder ? t("rightSidebar.overview.fileChanges.titleCoder") : t("rightSidebar.overview.fileChanges.title")}
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
						{t(isCoder ? "rightSidebar.overview.fileChanges.emptyCoder" : "rightSidebar.overview.fileChanges.empty")}
					</div>
				) : (
					<ul className="right-sidebar-file-change-list">
						{fileChanges.map((item) => {
							const itemKey = buildFileChangeKey(item.runId, item.filePath);
							const cacheKey = buildFileHistoryCacheKey(state.chatId, item);
							const expanded = expandedFileChangeKeys.has(itemKey);
							return (
								<li
									key={itemKey}
									className={`right-sidebar-file-change-item ${expanded ? "is-expanded" : ""}`.trim()}
								>
									<button
										type="button"
										className="right-sidebar-file-change-row"
										aria-expanded={expanded}
										onClick={() => toggleFileChange(item)}
									>
										<MaterialIcon
											name={expanded ? "expand_more" : "chevron_right"}
											className="right-sidebar-file-change-expand"
											aria-hidden="true"
										/>
										<MaterialIcon
											name={getFileIcon(item.filePath)}
											className="right-sidebar-file-change-icon"
											aria-hidden="true"
										/>
										<span
											className="right-sidebar-file-change-path-wrap"
											title={`${item.filePath} · ${item.runId}`}
										>
											<span className="right-sidebar-file-change-path">
												{displayFileName(item.filePath)}
											</span>
											<span className="right-sidebar-file-change-run">
												{item.runId}
											</span>
										</span>
										{renderFileChangeStats(item.addedLines, item.deletedLines, {
											animated: fileChangeAnimation.paths.has(itemKey),
											animationKey: `${itemKey}-${fileChangeAnimation.version}`,
										})}
									</button>
									{expanded && (
										<div className="right-sidebar-file-change-diff">
											{renderFileHistoryPanel(fileHistoryCache[cacheKey])}
										</div>
									)}
								</li>
							);
						})}
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
