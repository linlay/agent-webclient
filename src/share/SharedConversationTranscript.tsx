import React from "react";
import {
  getSafeConversationShareHref,
  type SharedConversationEntry,
} from "@/shared/data/conversationShare";
import {
  ConversationMarkdown,
  type ConversationMarkdownComponents,
  type ConversationMarkdownElementProps,
} from "@/shared/ui/ConversationMarkdown";
import { ShareMarkdownCode } from "@/share/ShareMarkdownCode";
import { TimelineCollapse } from "@/features/timeline/components/collapse";
import { t } from "@/shared/i18n";
import {
  formatSharedDuration,
  groupTranscriptEntries,
} from "./shareTranscriptGroups";
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
  entries: SharedConversationEntry[];
};

export const SharedConversationTranscript: React.FC<
  SharedConversationTranscriptProps
> = ({ entries }) => {
  const groups = groupTranscriptEntries(entries);

  return (
    <div className={styles.transcript}>
      {groups.map((group) => {
        if (group.type === "user") {
          return (
            <section
              className={styles.userRow}
              key={`user-${group.entry.createdAt ?? group.sourceIndex}-${group.sourceIndex}`}
            >
              <div className={styles.userBubble}>{group.entry.content}</div>
            </section>
          );
        }

        return (
          <section
            className={styles.assistantRow}
            key={`assistant-${group.sourceIndex}`}
          >
            <div className={styles.assistantIdentity}>
              <span className={styles.assistantMark} aria-hidden="true">
                {ASSISTANT_BRAND.slice(0, 1)}
              </span>
              <strong>{t("share.role.assistant")}</strong>
            </div>
            <div className={styles.assistantContent}>
              {group.traceEntries.length > 0 ? (
                <TimelineCollapse
                  className={styles.reasoning}
                  destroyOnHidden
                  label={
                    group.durationMs === undefined
                      ? t("share.reasoning.completedWithoutDuration")
                      : t("share.reasoning.completed", {
                          duration: formatSharedDuration(group.durationMs),
                        })
                  }
                >
                  <div className={styles.reasoningTrace}>
                    {group.traceEntries.map((entry, index) => {
                      if (entry.type === "reasoning") {
                        return (
                          <TimelineCollapse
                            className={styles.reasoningSegment}
                            destroyOnHidden
                            label={entry.label || t("share.reasoning.title")}
                            key={`reasoning-${entry.createdAt ?? index}-${index}`}
                          >
                            <ConversationMarkdown
                              className={styles.reasoningMarkdown}
                              content={entry.content}
                              components={MARKDOWN_COMPONENTS}
                              codeComponent={ShareMarkdownCode}
                            />
                          </TimelineCollapse>
                        );
                      }
                      return (
                        <ConversationMarkdown
                          className={`${styles.markdown} ${styles.processMessage}`}
                          content={entry.content}
                          components={MARKDOWN_COMPONENTS}
                          codeComponent={ShareMarkdownCode}
                          key={`process-message-${entry.createdAt ?? index}-${index}`}
                        />
                      );
                    })}
                  </div>
                </TimelineCollapse>
              ) : null}
              {group.responseEntries.map((entry, index) => (
                <ConversationMarkdown
                  className={styles.markdown}
                  content={entry.content}
                  components={MARKDOWN_COMPONENTS}
                  codeComponent={ShareMarkdownCode}
                  key={`message-${entry.createdAt ?? index}-${index}`}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

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

function OmittedImage({
  alt,
}: MarkdownImageProps): React.ReactElement {
  return (
    <span className={styles.omittedImage} role="note">
      {alt
        ? t("share.imageOmittedWithAlt", { alt })
        : t("share.imageOmitted")}
    </span>
  );
}
