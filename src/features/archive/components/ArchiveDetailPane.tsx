import React from "react";
import { Spin } from "antd";
import type { ArchiveDetailResponse, ArchivedSummaryResponse } from "@/shared/data";
import type { Agent } from "@/features/agents/lib/agentState";
import type { ArchiveConversationData } from "@/features/archive/lib/archiveConversation";
import { ConversationPreview } from "@/features/conversation/components/ConversationPreview";
import { TimelineAttachmentView } from "@/features/timeline/components/TimelineAttachmentView";
import { MarkdownContent } from "@/features/viewers/components/MarkdownContent";
import { useOpenTarget } from "@/features/surfaces/hooks/useOpenTarget";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import { copyText } from "@/shared/utils/copy";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { t } from "@/shared/i18n";

export interface ArchiveDetailPaneProps {
  selectedChatId: string;
  selectedItem?: ArchivedSummaryResponse;
  detail: ArchiveDetailResponse | null;
  loading: boolean;
  /** Archived conversation projection; null when the archive has nothing to render. */
  conversation: ArchiveConversationData | null;
  usageSummary: string;
  agents: Agent[];
}

const DETAIL_PANE_CLASS_NAME =
  "archive-detail-pane tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:border-l tw:py-2 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:overflow-hidden";
/** Matches `Timeline.module.css` `.conversation-stage-virtuoso > div` so the head lines up with the transcript column. */
const DETAIL_COLUMN_CLASS_NAME = "tw:mx-auto tw:w-full tw:max-w-[840px] tw:px-5";
const DETAIL_HEAD_CLASS_NAME =
  `archive-detail-head tw:flex tw:shrink-0 tw:items-start tw:justify-between tw:gap-3 ${DETAIL_COLUMN_CLASS_NAME} tw:[&_h3]:m-0 tw:[&_h3]:text-base tw:[&_p]:mb-0 tw:[&_p]:mt-1 tw:[&_p]:text-xs tw:[&_p]:text-ink-muted`;
const DETAIL_NOTE_CLASS_NAME =
  `tw:shrink-0 tw:pb-1 tw:text-xs tw:text-amber-600 ${DETAIL_COLUMN_CLASS_NAME}`;
const DETAIL_CONTENT_CLASS_NAME =
  "archive-detail-content tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-2 tw:overflow-hidden";

export const ArchiveDetailPane: React.FC<ArchiveDetailPaneProps> = (props) => {
  const openTarget = useOpenTarget();
  const message = useAppMessage();
  const agentKey = String(props.selectedItem?.agentKey || "").trim();
  const chatId = String(props.conversation?.chatId || props.selectedChatId || "").trim();

  if (!props.selectedChatId) {
    return (
      <section className={DETAIL_PANE_CLASS_NAME}>
        <div className="command-empty-state">{t("archive.empty.select")}</div>
      </section>
    );
  }

  return (
    <section className={DETAIL_PANE_CLASS_NAME}>
      <div className={DETAIL_HEAD_CLASS_NAME}>
        <div>
          <h3>{props.detail?.chatName || props.selectedItem?.chatName || props.selectedChatId}</h3>
          <p>
            {t("archive.detail.archivedAt", { time: formatChatTimeLabel(props.selectedItem?.archivedAt) })}
            {agentKey ? ` · ${agentKey}` : ""}
            {props.usageSummary ? ` · ${props.usageSummary}` : ""}
          </p>
        </div>
      </div>
      {props.detail?.artifactManifestUnavailable ? (
        <p className={DETAIL_NOTE_CLASS_NAME} role="note">{t("archive.detail.attachmentsUnavailable")}</p>
      ) : null}
      <div className={DETAIL_CONTENT_CLASS_NAME}>
        {props.loading ? (
          <div
            className="tw:absolute tw:inset-0 tw:z-10 tw:grid tw:place-items-center tw:bg-[color-mix(in_srgb,var(--bg-base)_38%,transparent)]"
            role="status"
            aria-busy="true"
          >
            <Spin size="small" />
          </div>
        ) : null}
        {props.conversation ? (
          <div className="tw:min-h-0 tw:flex-1">
            <ConversationPreview
              key={props.conversation.chatId}
              data={props.conversation}
              agents={props.agents}
              agentKey={agentKey}
              ariaLabel={t("archive.detail.conversationAria")}
              emptyLabel={t("archive.empty.detail")}
              getChatHref={(chat) => `/?${new URLSearchParams({ chatId: chat.chatId })}`}
              openTarget={openTarget}
              copyText={copyText}
              onCopyResult={(success, text) => success
                ? message.success(text ?? t("timeline.toolPill.copy.copied"))
                : message.error(text ?? t("timeline.toolPill.copy.failed"))}
              renderMarkdown={(markdown) => <MarkdownContent {...markdown} />}
              renderAttachment={(attachment, options) => <TimelineAttachmentView
                attachment={attachment}
                surfaceContext={{ chatId, agentKey: agentKey || undefined, teamChat: false }}
                options={options}
                openTarget={openTarget}
              />}
            />
          </div>
        ) : props.loading ? null : (
          <div className="command-empty-state">{t("archive.empty.detail")}</div>
        )}
      </div>
    </section>
  );
};