import React from "react";
import {
  getSafeConversationShareHref,
  type SharedConversationAssistantMessage,
  type SharedConversationTurn,
} from "@/shared/data/conversationShare";
import {
  ConversationMarkdown,
  type ConversationMarkdownComponents,
  type ConversationMarkdownElementProps,
} from "@/shared/ui/ConversationMarkdown";
import { ShareMarkdownCode } from "@/share/ShareMarkdownCode";
import { TimelineCollapse } from "@/shared/ui/TimelineCollapse";
import { t } from "@/shared/i18n";
import styles from "./SharedConversationTranscript.module.css";

type MarkdownLinkProps = ConversationMarkdownElementProps<{
  href?: string;
  title?: string;
}>;
type MarkdownImageProps = ConversationMarkdownElementProps<{
  alt?: string;
  src?: string;
}>;

const MARKDOWN_COMPONENTS: ConversationMarkdownComponents = {
  a: SafeExternalLink,
  img: OmittedImage,
};
const ASSISTANT_BRAND = "ZenMind";

export type SharedConversationTranscriptProps = {
  turns: SharedConversationTurn[];
};

export const SharedConversationTranscript: React.FC<
  SharedConversationTranscriptProps
> = ({ turns }) => (
  <div className={styles.transcript}>
    {turns.map((turn, turnIndex) => (
      <TranscriptTurn
        key={`turn-${turn.startedAt}-${turnIndex}`}
        turn={turn}
        turnIndex={turnIndex}
      />
    ))}
  </div>
);

function TranscriptTurn({
  turn,
  turnIndex,
}: {
  turn: SharedConversationTurn;
  turnIndex: number;
}): React.ReactElement {
  const [userMessage, ...assistantItems] = turn.items;
  const hasReasoning = assistantItems.some((item) => item.kind === "assistant-reasoning");
  const lastAssistantItem = assistantItems.at(-1);
  const finalResponse = hasReasoning && lastAssistantItem?.kind === "assistant-message"
    ? lastAssistantItem
    : null;
  const traceItems = hasReasoning
    ? finalResponse
      ? assistantItems.slice(0, -1)
      : assistantItems
    : [];
  const responseItems = hasReasoning
    ? finalResponse
      ? [finalResponse]
      : []
    : assistantItems.filter(
        (item): item is SharedConversationAssistantMessage =>
          item.kind === "assistant-message",
      );
  const durationMs = turn.completedAt === undefined
    ? undefined
    : turn.completedAt - turn.startedAt;

  return (
    <>
      <section
        className={styles.userRow}
        key={`user-${userMessage.createdAt}-${turnIndex}`}
      >
        <div className={styles.userBubble}>{userMessage.content}</div>
      </section>
      {assistantItems.length > 0 ? (
        <section className={styles.assistantRow}>
          <div className={styles.assistantIdentity}>
            <span className={styles.assistantMark} aria-hidden="true">
              {ASSISTANT_BRAND.slice(0, 1)}
            </span>
            <strong>{t("share.role.assistant")}</strong>
          </div>
          <div className={styles.assistantContent}>
            {traceItems.length > 0 ? (
              <TimelineCollapse
                className={styles.reasoning}
                destroyOnHidden
                label={
                  durationMs === undefined
                    ? t("share.reasoning.completedWithoutDuration")
                    : t("share.reasoning.completed", {
                        duration: formatSharedDuration(durationMs),
                      })
                }
              >
                <div className={styles.reasoningTrace}>
                  {traceItems.map((item, index) => {
                    if (item.kind === "assistant-reasoning") {
                      return (
                        <TimelineCollapse
                          className={styles.reasoningSegment}
                          destroyOnHidden
                          label={item.label || t("share.reasoning.title")}
                          key={`reasoning-${item.createdAt}-${index}`}
                        >
                          <ConversationMarkdown
                            className={styles.reasoningMarkdown}
                            content={item.content}
                            components={MARKDOWN_COMPONENTS}
                            codeComponent={ShareMarkdownCode}
                          />
                        </TimelineCollapse>
                      );
                    }
                    return (
                      <ConversationMarkdown
                        className={`${styles.markdown} ${styles.processMessage}`}
                        content={item.content}
                        components={MARKDOWN_COMPONENTS}
                        codeComponent={ShareMarkdownCode}
                        key={`process-message-${item.createdAt}-${index}`}
                      />
                    );
                  })}
                </div>
              </TimelineCollapse>
            ) : null}
            {responseItems.map((item, index) => (
              <ConversationMarkdown
                className={styles.markdown}
                content={item.content}
                components={MARKDOWN_COMPONENTS}
                codeComponent={ShareMarkdownCode}
                key={`message-${item.createdAt}-${index}`}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

export function formatSharedDuration(durationMs: number): string {
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) return "";
  if (durationMs < 1000) return `${durationMs}ms`;

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return `${totalMinutes}m${seconds}s`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${minutes}m`;
}

function SafeExternalLink({
  href,
  children,
  title,
}: MarkdownLinkProps): React.ReactElement {
  const safeHref = getSafeConversationShareHref(href);
  if (!safeHref) return <span title={title}>{children}</span>;
  return (
    <a
      href={safeHref}
      title={title}
      target="_blank"
      rel="noreferrer noopener"
      referrerPolicy="no-referrer"
    >
      {children}
    </a>
  );
}

function OmittedImage({ alt }: MarkdownImageProps): React.ReactElement {
  return (
    <span className={styles.omittedImage} role="note">
      {alt
        ? t("share.imageOmittedWithAlt", { alt })
        : t("share.imageOmitted")}
    </span>
  );
}
