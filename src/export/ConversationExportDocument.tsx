import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  type ConversationSnapshotAssistantItemV1,
  type ConversationSnapshotTurnV1,
  type ConversationSnapshotV1,
} from "./conversationSnapshot";
import {
  ConversationMarkdown,
  type ConversationMarkdownComponents,
  type ConversationMarkdownElementProps,
} from "@/shared/ui/ConversationMarkdown";
import {
  conversationExportMessages,
  resolveConversationExportLocale,
  type ConversationExportLocale,
} from "@/shared/i18n/conversationExport";
import { StaticMarkdownCode } from "./StaticMarkdownCode";
import { buildConversationCopyText } from "./conversationCopyText";
import styles from "./ConversationExportDocument.module.css";

type MarkdownLinkProps = ConversationMarkdownElementProps<{
  href?: string;
  title?: string;
}>;

type MarkdownImageProps = ConversationMarkdownElementProps<{
  alt?: string;
}>;

const MARKDOWN_COMPONENTS: ConversationMarkdownComponents = {
  a: SafeExternalLink,
  img: OmittedImage,
};

const COPY_FEEDBACK_DURATION_MS = 1_600;

type CopyState = "idle" | "copied" | "failed";

export type ConversationExportDocumentProps = {
  locale: ConversationExportLocale;
  snapshot: ConversationSnapshotV1;
};

export const ConversationExportDocument: React.FC<
  ConversationExportDocumentProps
> = ({ locale, snapshot }) => {
  const copy = conversationExportMessages[locale];
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyFeedbackTimer = useRef<number | null>(null);
  const copyText = useMemo(
    () => buildConversationCopyText(snapshot, locale),
    [locale, snapshot],
  );
  const copyButtonLabel =
    copyState === "copied"
      ? copy.copyCopied
      : copyState === "failed"
        ? copy.copyFailed
        : copy.copyAction;

  useEffect(
    () => () => {
      if (copyFeedbackTimer.current !== null) {
        window.clearTimeout(copyFeedbackTimer.current);
      }
    },
    [],
  );

  const copyConversation = async (): Promise<void> => {
    if (!copyText || !navigator.clipboard) {
      showCopyFeedback("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(copyText);
      showCopyFeedback("copied");
    } catch {
      showCopyFeedback("failed");
    }
  };

  const showCopyFeedback = (state: Exclude<CopyState, "idle">): void => {
    setCopyState(state);
    if (copyFeedbackTimer.current !== null) {
      window.clearTimeout(copyFeedbackTimer.current);
    }
    copyFeedbackTimer.current = window.setTimeout(
      () => setCopyState("idle"),
      COPY_FEEDBACK_DURATION_MS,
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <h1 title={snapshot.title}>{snapshot.title}</h1>
          </div>
          <button
            className={styles.copyButton}
            type="button"
            aria-label={copyButtonLabel}
            aria-live="polite"
            data-state={copyState}
            onClick={() => void copyConversation()}
          >
            {copyButtonLabel}
          </button>
        </header>

        <div className={styles.notice}>
          <p>{copy.aiNotice}</p>
        </div>

        <article className={styles.content}>
          <ExportTranscript copy={copy} turns={snapshot.turns} />
        </article>

        <footer className={styles.footer}>{copy.readOnly}</footer>
      </div>
    </main>
  );
};

function ExportTranscript({
  copy,
  turns,
}: {
  copy: (typeof conversationExportMessages)[ConversationExportLocale];
  turns: readonly ConversationSnapshotTurnV1[];
}): React.ReactElement {
  return (
    <div className={styles.transcript}>
      {turns.map((turn, index) => (
        <ExportTurn
          copy={copy}
          key={`${turn.startedAt}-${index}`}
          turn={turn}
        />
      ))}
    </div>
  );
}

function ExportTurn({
  copy,
  turn,
}: {
  copy: (typeof conversationExportMessages)[ConversationExportLocale];
  turn: ConversationSnapshotTurnV1;
}): React.ReactElement {
  const [userMessage, ...assistantItems] = turn.items;
  const hasReasoning = assistantItems.some(
    (item) => item.kind === "reasoning",
  );
  const lastAssistantItem = assistantItems.at(-1);
  const finalResponse =
    hasReasoning && lastAssistantItem?.kind === "assistant"
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
        (item): item is ConversationSnapshotAssistantItemV1 & { kind: "assistant" } =>
          item.kind === "assistant",
      );
  const duration =
    turn.endedAt === undefined
      ? ""
      : formatDuration(turn.endedAt - turn.startedAt);

  return (
    <article className={styles.turn}>
      <section className={styles.userRow}>
        <div className={styles.userBubble}>{userMessage.text}</div>
      </section>

      {assistantItems.length > 0 ? (
        <section className={styles.assistantRow}>
          <div className={styles.assistantIdentity}>
            <strong>{copy.assistant}</strong>
          </div>
          <div className={styles.assistantContent}>
            {traceItems.length > 0 ? (
              <details className={styles.reasoning}>
                <summary>
                  {turn.outcome === "running"
                    ? copy.reasoningSnapshot
                    : duration
                      ? copy.reasoningCompleted.replace("{duration}", duration)
                      : copy.reasoningCompletedWithoutDuration}
                </summary>
                <div className={styles.reasoningBody}>
                  {traceItems.map((item, index) =>
                    item.kind === "reasoning" ? (
                      <details
                        className={styles.reasoningSegment}
                        key={`${item.at}-${index}`}
                      >
                        <summary>
                          {item.label || copy.untitledReasoning}
                        </summary>
                        <ConversationMarkdown
                          className={styles.reasoningMarkdown}
                          content={item.text}
                          components={MARKDOWN_COMPONENTS}
                          codeComponent={StaticMarkdownCode}
                        />
                      </details>
                    ) : (
                      <ConversationMarkdown
                        className={styles.processMessage}
                        content={item.text}
                        components={MARKDOWN_COMPONENTS}
                        codeComponent={StaticMarkdownCode}
                        key={`${item.at}-${index}`}
                      />
                    ),
                  )}
                </div>
              </details>
            ) : null}

            {responseItems.map((item, index) => (
              <ConversationMarkdown
                className={
                  hasReasoning
                    ? `${styles.markdown} ${styles.finalResponse}`
                    : styles.markdown
                }
                content={item.text}
                components={MARKDOWN_COMPONENTS}
                codeComponent={StaticMarkdownCode}
                key={`${item.at}-${index}`}
              />
            ))}
            {turn.outcome !== "completed" ? (
              <p className={styles.turnStatus}>{copy.outcome[turn.outcome]}</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </article>
  );
}

function SafeExternalLink({
  children,
  href,
  title,
}: MarkdownLinkProps): React.ReactElement {
  const safeHref = getSafeHref(href);
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
        ? `${conversationExportMessages[resolveConversationExportLocale()].imageOmitted}: ${alt}`
        : conversationExportMessages[resolveConversationExportLocale()].imageOmitted}
    </span>
  );
}

function getSafeHref(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function formatDuration(durationMs: number): string {
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) return "";
  if (durationMs < 1000) return `${durationMs}ms`;
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return `${totalMinutes}m${seconds}s`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h${totalMinutes % 60}m`;
}
