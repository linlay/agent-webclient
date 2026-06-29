import React from "react";
import type {
	TimelineNode,
	TimelineSource,
	TimelineSourceChunk,
} from "@/app/state/types";
import { useAppDispatch } from "@/app/state/AppContext";
import { t as runtimeT, useI18n } from "@/shared/i18n";
import type { TranslateParams } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

type TranslateFn = (key: string, params?: TranslateParams) => string;

function basename(value: string): string {
	const normalized = value.replace(/\\/g, "/");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] || value;
}

function formatRange(
	start: number | undefined,
	end: number | undefined,
	singleKey: string,
	rangeKey: string,
	translate: TranslateFn,
): string {
	if (!Number.isFinite(start)) {
		return "";
	}
	const normalizedStart = Number(start);
	const normalizedEnd = Number.isFinite(end) ? Number(end) : normalizedStart;
	if (normalizedEnd > normalizedStart) {
		return translate(rangeKey, {
			start: normalizedStart,
			end: normalizedEnd,
		});
	}
	return translate(singleKey, { start: normalizedStart });
}

export function formatSourceLocator(
	chunk: TimelineSourceChunk,
	translate: TranslateFn = runtimeT,
): string {
	return [
		formatRange(
			chunk.startLine,
			chunk.endLine,
			"timeline.source.locator.line",
			"timeline.source.locator.lineRange",
			translate,
		),
		formatRange(
			chunk.pageStart,
			chunk.pageEnd,
			"timeline.source.locator.page",
			"timeline.source.locator.pageRange",
			translate,
		),
		formatRange(
			chunk.slideStart,
			chunk.slideEnd,
			"timeline.source.locator.slide",
			"timeline.source.locator.slideRange",
			translate,
		),
		chunk.sourceType || "",
		chunk.matchType || "",
	]
		.filter(Boolean)
		.join(" · ");
}

export function formatSourceScore(
	score: number | undefined,
	translate: TranslateFn = runtimeT,
): string {
	if (!Number.isFinite(score)) {
		return "";
	}
	const normalized = Number(score)
		.toFixed(Math.abs(Number(score)) < 1 ? 3 : 2)
		.replace(/0+$/, "")
		.replace(/\.$/, "");
	return translate("timeline.source.score", { score: normalized });
}

function sourcePath(source: TimelineSource): string {
	return (
		source.title ||
		source.chunks.find((chunk) => chunk.path)?.path ||
		source.name ||
		source.id
	);
}

function sourceName(source: TimelineSource): string {
	return source.name || basename(sourcePath(source)) || source.id;
}

function chunkKey(source: TimelineSource, chunk: TimelineSourceChunk): string {
	return chunk.chunkId || `${source.id}_${chunk.index}`;
}

export interface SourceBlockProps {
	node: TimelineNode;
}

export const SourceBlock: React.FC<SourceBlockProps> = ({ node }) => {
	const dispatch = useAppDispatch();
	const { t } = useI18n();
	const sources = Array.isArray(node.sources) ? node.sources : [];
	const sourceCount = node.sourceCount ?? sources.length;
	const chunkCount =
		node.chunkCount ??
		sources.reduce((sum, source) => sum + source.chunks.length, 0);
	const expanded = Boolean(node.expanded);
	const query = String(node.sourceQuery || "").trim();
	const toggleLabel = expanded
		? t("timeline.source.collapse")
		: t("timeline.source.expand");

	return (
		<section className="source-block" data-expanded={expanded}>
			<header className="source-block-header">
				<div className="source-block-heading">
					<div className="source-block-title">
						{t("timeline.source.title", { count: sourceCount })}
					</div>
					<div className="source-block-meta">
						{t("timeline.source.chunkCount", { count: chunkCount })}
					</div>
				</div>
				<UiButton
					variant="ghost"
					size="sm"
					iconOnly
					className="source-block-toggle"
					title={toggleLabel}
					aria-label={toggleLabel}
					aria-expanded={expanded}
					onClick={() => {
						dispatch({
							type: "SET_TIMELINE_NODE",
							id: node.id,
							node: {
								...node,
								expanded: !expanded,
							},
						});
					}}
				>
					<MaterialIcon
						name={expanded ? "keyboard_arrow_up" : "keyboard_arrow_down"}
					/>
				</UiButton>
			</header>

			{query && (
				<div className="source-query">
					{t("timeline.source.query", { query })}
				</div>
			)}

			<div className="source-list">
				{sources.map((source) => {
					const path = sourcePath(source);
					const visibleChunks = expanded
						? source.chunks
						: source.chunks.slice(0, 1);
					const hiddenCount = source.chunks.length - visibleChunks.length;

					return (
						<article className="source-item" key={source.id}>
							<div className="source-item-header">
								<div className="source-item-title">
									<MaterialIcon name="article" />
									<span>{sourceName(source)}</span>
								</div>
								{path && path !== sourceName(source) && (
									<div className="source-item-path" title={path}>
										{path}
									</div>
								)}
							</div>

							<div className="source-chunks">
								{visibleChunks.map((chunk) => {
									const locator = formatSourceLocator(chunk, t);
									const score = formatSourceScore(chunk.score, t);
									const meta = [
										`#${chunk.index}`,
										chunk.heading || "",
										locator,
										score,
									]
										.filter(Boolean)
										.join(" · ");

									return (
										<div
											className="source-chunk"
											key={chunkKey(source, chunk)}
										>
											{meta && (
												<div className="source-chunk-meta">
													{meta}
												</div>
											)}
											{chunk.content && (
												<div className="source-chunk-text">
													{chunk.content}
												</div>
											)}
										</div>
									);
								})}
								{hiddenCount > 0 && (
									<div className="source-more">
										{t("timeline.source.moreChunks", {
											count: hiddenCount,
										})}
									</div>
								)}
							</div>
						</article>
					);
				})}
			</div>
		</section>
	);
};
