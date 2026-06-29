import React from "react";
import { useAppState } from "@/app/state/AppContext";
import type { TimelineSource, TimelineSourceChunk } from "@/app/state/types";
import { MarkdownContent } from "@/shared/ui/MarkdownContent";
import { t, TranslateParams } from "@/shared/i18n";
import { Flex, Tag } from "antd";

type TranslateFn = (key: string, params?: TranslateParams) => string;

export function formatSourceScore(
  score: number | undefined,
  translate: TranslateFn = t,
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

function sourceDisplayName(source: TimelineSource): string {
  return source.title || source.name || source.id;
}

function sourceSubtitle(source: TimelineSource): string {
  const parts: string[] = [];
  if (source.url) parts.push(source.url);
  if (source.collectionName) parts.push(source.collectionName);
  return parts.join(" · ") || source.id;
}

export const SourceDetailTab: React.FC = () => {
  const state = useAppState();
  const source = state.activeSourceDetail;
  const [activeChunkId, setActiveChunkId] = React.useState<string>("");

  const chunks = React.useMemo(
    () =>
      source?.chunks
        ? [...source.chunks].sort((a, b) => a.index - b.index)
        : [],
    [source],
  );

  React.useEffect(() => {
    if (chunks.length > 0) {
      setActiveChunkId(chunks[0].chunkId);
    }
  }, [chunks]);

  const activeChunk = React.useMemo(
    () => chunks.find((c) => c.chunkId === activeChunkId) ?? null,
    [chunks, activeChunkId],
  );

  if (!source) {
    return (
      <div className="right-sidebar-source-detail">
        <div className="right-sidebar-empty">
          {t("rightSidebar.sourceDetail.empty")}
        </div>
      </div>
    );
  }

  return (
    <div className="right-sidebar-source-detail">
      <div className="right-sidebar-source-detail-head">
        <div className="right-sidebar-source-detail-title">
          <Tag color="blue">{sourceSubtitle(source)}</Tag>
          <span>{sourceDisplayName(source)}</span>
        </div>
        <div className="right-sidebar-source-detail-meta">
          {t("rightSidebar.sourceDetail.chunkCount", { count: chunks.length })}
        </div>
      </div>

      <div className="right-sidebar-source-detail-body">
        <ul className="right-sidebar-source-detail-chunk-list">
          {chunks.map((chunk) => (
            <ChunkItem
              key={chunk.chunkId}
              chunk={chunk}
              active={chunk.chunkId === activeChunkId}
              onClick={() => setActiveChunkId(chunk.chunkId)}
            />
          ))}
        </ul>

        <div className="right-sidebar-source-detail-content">
          {activeChunk?.content ? (
            <div className="right-sidebar-source-detail-chunk-content">
              <MarkdownContent content={activeChunk.content} />
            </div>
          ) : (
            <div className="right-sidebar-empty">
              {t("rightSidebar.sourceDetail.selectChunk")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface ChunkItemProps {
  chunk: TimelineSourceChunk;
  active: boolean;
  onClick: () => void;
}

const ChunkItem: React.FC<ChunkItemProps> = ({ chunk, active, onClick }) => {
  const heading =
    chunk.heading || chunk.content?.slice(0, 80).replace(/\n/g, " ") || "";

  return (
    <li
      className={`right-sidebar-source-detail-chunk-item ${active ? "is-active" : ""}`.trim()}
    >
      <button
        type="button"
        className="right-sidebar-source-detail-chunk-row"
        onClick={onClick}
      >
        <div>
          <span className="right-sidebar-source-detail-chunk-index">#{chunk.index}</span>
          <span className="right-sidebar-source-detail-chunk-text">
            {heading || t("rightSidebar.sourceDetail.untitledChunk")}
          </span>
        </div>
        <span className="right-sidebar-source-detail-chunk-meta">
          {chunk.matchType && <Tag>{chunk.matchType}</Tag>}
          {chunk.score && (
            <Tag color="gold">{formatSourceScore(chunk.score)}</Tag>
          )}
          <span>
            {formatRange(
              chunk.startLine,
              chunk.endLine,
              "timeline.source.locator.line",
              "timeline.source.locator.lineRange",
              t,
            )}
            {formatRange(
              chunk.pageStart,
              chunk.pageEnd,
              "timeline.source.locator.page",
              "timeline.source.locator.pageRange",
              t,
            )}
            {formatRange(
              chunk.slideStart,
              chunk.slideEnd,
              "timeline.source.locator.slide",
              "timeline.source.locator.slideRange",
              t,
            )}
          </span>
        </span>
      </button>
    </li>
  );
};
