import React from "react";
import { useAppState } from "@/app/state/AppContext";
import type { TimelineSource, TimelineSourceChunk } from "@/app/state/types";
import { MarkdownContent } from "@/shared/ui/MarkdownContent";
import { t, TranslateParams } from "@/shared/i18n";
import { Flex, Tag } from "antd";
import { SourceScore } from "@/features/source/components/source-score";

type TranslateFn = (key: string, params?: TranslateParams) => string;

const SOURCE_DETAIL_CLASS_NAME =
  "right-sidebar-source-detail tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:overflow-hidden";

const SOURCE_DETAIL_EMPTY_CLASS_NAME =
  "right-sidebar-empty tw:rounded-lg tw:border tw:border-dashed tw:border-line-soft tw:px-3 tw:py-3.5 tw:text-center tw:text-xs tw:text-ink-muted";

const SOURCE_DETAIL_HEAD_CLASS_NAME =
  "right-sidebar-source-detail-head tw:flex-none tw:flex tw:flex-col tw:gap-1 tw:p-3";

const SOURCE_DETAIL_TITLE_CLASS_NAME =
  "right-sidebar-source-detail-title tw:font-bold tw:text-ink-1";

const SOURCE_DETAIL_META_CLASS_NAME =
  "right-sidebar-source-detail-meta tw:mt-0.5 tw:text-[11px] tw:text-ink-muted";

const SOURCE_DETAIL_BODY_CLASS_NAME =
  "right-sidebar-source-detail-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden";

const SOURCE_DETAIL_CHUNK_LIST_CLASS_NAME =
  "right-sidebar-source-detail-chunk-list tw:m-0 tw:flex tw:max-h-[50%] tw:list-none tw:flex-col tw:gap-1 tw:overflow-y-auto tw:px-2 tw:pb-2 tw:pt-0";

const SOURCE_DETAIL_CONTENT_CLASS_NAME =
  "right-sidebar-source-detail-content tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-y-auto";

const SOURCE_DETAIL_CHUNK_CONTENT_CLASS_NAME =
  "right-sidebar-source-detail-chunk-content tw:flex-1 tw:overflow-auto tw:px-2.5 tw:py-0";

const SOURCE_DETAIL_CHUNK_ITEM_CLASS_NAME =
  "right-sidebar-source-detail-chunk-item tw:min-w-0 tw:overflow-hidden tw:rounded-md tw:border tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-input)_78%,white)]";

const SOURCE_DETAIL_CHUNK_ITEM_ACTIVE_CLASS_NAME =
  "is-active tw:border-accent-electric tw:bg-[color-mix(in_srgb,var(--accent-soft)_30%,transparent)]";

const SOURCE_DETAIL_CHUNK_ROW_CLASS_NAME =
  "right-sidebar-source-detail-chunk-row tw:flex tw:w-full tw:min-w-0 tw:cursor-pointer tw:flex-col tw:items-start tw:gap-1.5 tw:border-0 tw:bg-transparent tw:px-2 tw:py-1.5 tw:text-left tw:text-inherit tw:hover:bg-[color-mix(in_srgb,var(--accent-soft)_24%,transparent)]";

const SOURCE_DETAIL_CHUNK_INDEX_CLASS_NAME =
  "right-sidebar-source-detail-chunk-index tw:mr-2.5 tw:text-accent";

const SOURCE_DETAIL_CHUNK_TEXT_CLASS_NAME =
  "right-sidebar-source-detail-chunk-text tw:w-full tw:text-xs tw:text-ink-1";

const SOURCE_DETAIL_CHUNK_META_CLASS_NAME =
  "right-sidebar-source-detail-chunk-meta tw:w-full tw:min-w-0 tw:text-xs tw:text-ink-muted tw:[&>span]:min-w-0 tw:[&>span]:overflow-hidden tw:[&>span]:text-ellipsis tw:[&>span]:whitespace-nowrap";

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

export function resolveInitialSourceChunkId(
  chunks: TimelineSourceChunk[],
  initialChunkId: string,
): string {
  if (chunks.length === 0) return "";
  const initial = String(initialChunkId || "").trim();
  return initial && chunks.some((chunk) => chunk.chunkId === initial)
    ? initial
    : chunks[0].chunkId;
}

export const SourceDetailContent: React.FC<{
  source: TimelineSource | null;
  chatId: string;
  teamChat?: boolean;
  initialChunkId?: string;
}> = ({
  source,
  chatId,
  teamChat = false,
  initialChunkId = "",
}) => {
  const [activeChunkId, setActiveChunkId] = React.useState<string>("");

  const chunks = React.useMemo(
    () =>
      source?.chunks
        ? [...source.chunks].sort((a, b) => a.index - b.index)
        : [],
    [source],
  );

  React.useEffect(() => {
    if (chunks.length === 0) {
      setActiveChunkId("");
      return;
    }
    setActiveChunkId(resolveInitialSourceChunkId(chunks, initialChunkId));
  }, [chunks, initialChunkId]);

  const activeChunk = React.useMemo(
    () => chunks.find((c) => c.chunkId === activeChunkId) ?? null,
    [chunks, activeChunkId],
  );

  if (!source) {
    return (
      <div className={SOURCE_DETAIL_CLASS_NAME}>
        <div className={SOURCE_DETAIL_EMPTY_CLASS_NAME}>
          {t("rightSidebar.sourceDetail.empty")}
        </div>
      </div>
    );
  }

  return (
    <div className={SOURCE_DETAIL_CLASS_NAME}>
      <div className={SOURCE_DETAIL_HEAD_CLASS_NAME}>
        <div className={SOURCE_DETAIL_TITLE_CLASS_NAME}>
          <Tag color="blue">{sourceSubtitle(source)}</Tag>
          <span>{sourceDisplayName(source)}</span>
        </div>
        <div className={SOURCE_DETAIL_META_CLASS_NAME}>
          {t("rightSidebar.sourceDetail.chunkCount", { count: chunks.length })}
        </div>
      </div>

      <div className={SOURCE_DETAIL_BODY_CLASS_NAME}>
        <ul className={SOURCE_DETAIL_CHUNK_LIST_CLASS_NAME}>
          {chunks.map((chunk) => (
            <ChunkItem
              key={chunk.chunkId}
              chunk={chunk}
              active={chunk.chunkId === activeChunkId}
              onClick={() => setActiveChunkId(chunk.chunkId)}
            />
          ))}
        </ul>

        <div className={SOURCE_DETAIL_CONTENT_CLASS_NAME}>
          {activeChunk?.content ? (
            <div className={SOURCE_DETAIL_CHUNK_CONTENT_CLASS_NAME}>
              <MarkdownContent
                content={activeChunk.content}
                chatId={chatId}
                teamChat={teamChat}
              />
            </div>
          ) : (
            <div className={SOURCE_DETAIL_EMPTY_CLASS_NAME}>
              {t("rightSidebar.sourceDetail.selectChunk")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const SourceDetailTab: React.FC = () => {
  const state = useAppState();
  const currentChat = state.chats.find((chat) => chat.chatId === state.chatId);
  const teamChat = Boolean(
    currentChat?.owner?.kind === "orchestrated-team"
    || String(currentChat?.teamId || "").trim(),
  );
  return (
    <SourceDetailContent
      source={state.activeSourceDetail}
      chatId={state.chatId}
      teamChat={teamChat}
    />
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
      className={[
        SOURCE_DETAIL_CHUNK_ITEM_CLASS_NAME,
        active ? SOURCE_DETAIL_CHUNK_ITEM_ACTIVE_CLASS_NAME : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className={SOURCE_DETAIL_CHUNK_ROW_CLASS_NAME}
        onClick={onClick}
      >
        <div>
          <span className={SOURCE_DETAIL_CHUNK_INDEX_CLASS_NAME}>
            #{chunk.index}
          </span>
          <span className={SOURCE_DETAIL_CHUNK_TEXT_CLASS_NAME}>
            {heading || t("rightSidebar.sourceDetail.untitledChunk")}
          </span>
        </div>
        <Flex
          className={SOURCE_DETAIL_CHUNK_META_CLASS_NAME}
          wrap
          gap={4}
          align="center"
        >
          {chunk.matchType && <Tag color="gold">{chunk.matchType}</Tag>}
          {chunk.score && <SourceScore score={chunk.score} />}
          <span>
            {formatRange(
              chunk.startLine,
              chunk.endLine,
              "timeline.source.locator.line",
              "timeline.source.locator.lineRange",
              t,
            )}
          </span>
          <span>
            {formatRange(
              chunk.pageStart,
              chunk.pageEnd,
              "timeline.source.locator.page",
              "timeline.source.locator.pageRange",
              t,
            )}
          </span>
          <span>
            {formatRange(
              chunk.slideStart,
              chunk.slideEnd,
              "timeline.source.locator.slide",
              "timeline.source.locator.slideRange",
              t,
            )}
          </span>
        </Flex>
      </button>
    </li>
  );
};
