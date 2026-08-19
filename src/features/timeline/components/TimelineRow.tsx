import React from "react";
import { Flex } from "antd";
import type { TimelineNode } from "@/app/state/types";
import type { TimelineRenderEntry } from "@/features/timeline/lib/timelineDisplay";
import {
  formatAttachmentSize,
  getAttachmentKind,
  getAttachmentKindLabel,
  getAttachmentSizeBytes,
} from "@/features/artifacts/lib/attachmentUtils";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { ReferenceCard } from "@/features/artifacts/components/ReferenceCard";
import { UserBubble } from "@/features/timeline/components/UserBubble";
import { ThinkingBlock } from "@/features/timeline/components/ThinkingBlock";
import { AwaitingAnswerBlock } from "@/features/timeline/components/AwaitingAnswerBlock";
import { ToolPill } from "@/features/timeline/components/ToolPill";
import { ContentBlock } from "@/features/timeline/components/ContentBlock";
import { SourceBlock } from "@/features/timeline/components/SourceBlock";
import { SystemAlert } from "@/features/timeline/components/SystemAlert";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { t as runtimeT, useI18n, type Locale } from "@/shared/i18n";
import { PlanningTimeline } from "./planning";
import { useOpenTarget } from "@/features/surfaces/openTarget";

type ToolGroupRenderEntry = Extract<
  TimelineRenderEntry,
  { kind: "tool-group" }
>;

interface TimelineRowProps {
  node?: TimelineNode;
  toolGroup?: ToolGroupRenderEntry;
  showTime?: boolean;
  metaNode?: React.ReactNode;
}

const TIMELINE_ROW_BASE_CLASS_NAME = "timeline-row tw:relative";
const TIMELINE_ROW_USER_CLASS_NAME = `${TIMELINE_ROW_BASE_CLASS_NAME} timeline-row-user tw:ml-auto tw:max-w-[87%] tw:pl-5`;
const TIMELINE_ROW_FLOW_CLASS_NAME = `${TIMELINE_ROW_BASE_CLASS_NAME} timeline-row-flow tw:grid tw:grid-cols-[18px_minmax(0,1fr)] tw:items-start tw:gap-2.5`;
const TIMELINE_ROW_PLANNING_CLASS_NAME = `${TIMELINE_ROW_FLOW_CLASS_NAME} tw:my-5`;
const TIMELINE_USER_STACK_CLASS_NAME =
  "timeline-user-stack tw:flex tw:flex-col tw:items-end tw:gap-2";
const TIMELINE_USER_ATTACHMENTS_BASE_CLASS_NAME =
  "timeline-user-attachments tw:w-full tw:justify-end";
const TIMELINE_USER_ATTACHMENTS_SINGLE_CLASS_NAME = "tw:flex tw:gap-2.5";
const TIMELINE_MARKER_CLASS_NAME = "timeline-marker tw:flex";
const NODE_ICON_BASE_CLASS_NAME =
  "node-icon tw:relative tw:z-[2] tw:inline-flex tw:h-[18px] tw:w-[18px] tw:items-center tw:justify-center tw:[&_.material-icon]:text-lg tw:[&_svg]:block tw:[&_svg]:h-[18px] tw:[&_svg]:w-[18px] tw:[&_svg]:stroke-current tw:[&_svg]:stroke-[1.8] tw:[&_svg]:[stroke-linecap:round] tw:[&_svg]:[stroke-linejoin:round]  tw:bg-bg-base tw:outline tw:outline-3 tw:outline-bg-base";
const NODE_ICON_STEER_CLASS_NAME = `${NODE_ICON_BASE_CLASS_NAME} node-icon-steer tw:text-accent-electric`;
const NODE_ICON_PLANNING_CLASS_NAME = `${NODE_ICON_BASE_CLASS_NAME} node-icon-planning tw:text-accent-electric-strong`;
const NODE_ICON_CLASS_BY_KIND: Record<string, string> = {
  thinking: "node-icon-thinking tw:text-accent-warn",
  "awaiting-answer": "node-icon-awaiting-answer tw:text-accent-warn",
  tool: "node-icon-tool tw:text-accent-electric-strong",
  content: "node-icon-content tw:text-accent-lime",
  source: "node-icon-source tw:text-accent-electric-strong",
  alert: "node-icon-alert tw:text-accent-danger",
  assistant: "node-icon-assistant tw:text-accent-electric",
};
const TIMELINE_FLOW_CONTENT_CLASS_NAME =
  "timeline-flow-content tw:flex tw:min-w-0 tw:flex-col tw:gap-2 tw:rounded-none tw:border-0 tw:bg-transparent tw:p-0 tw:shadow-none";
const TIMELINE_CONTENT_FLOW_CLASS_NAME =
  "tw:w-[min(100%,820px)] tw:max-w-[820px]";
const TIMELINE_SOURCE_FLOW_CLASS_NAME =
  "tw:w-[min(100%,760px)] tw:max-w-[760px]";
const TIMELINE_ROW_TIME_CLASS_NAME =
  "timeline-row-time tw:ml-auto tw:shrink-0 tw:pl-2 tw:text-[10px] tw:leading-none tw:text-ink-muted tw:tracking-[0.02em]";
const TIMELINE_COMMAND_LABEL_CLASS_NAME =
  "timeline-command-label tw:mt-[9px] tw:font-code tw:text-[11px] tw:font-bold tw:leading-none tw:tracking-[0.06em] tw:text-accent-electric-strong tw:uppercase tw:empty:hidden";

function createTimeFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function createDateTimeFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(target: Date, now: Date): boolean {
  const y = new Date(now);
  y.setHours(0, 0, 0, 0);
  y.setDate(y.getDate() - 1);
  return (
    target.getFullYear() === y.getFullYear() &&
    target.getMonth() === y.getMonth() &&
    target.getDate() === y.getDate()
  );
}

export function formatTimelineTime(
  ts?: number,
  locale: Locale = "zh-CN",
  labels?: { today: string; yesterday: string },
): {
  short: string;
  full: string;
} {
  if (!ts) return { short: "", full: "" };
  const target = new Date(ts);
  if (Number.isNaN(target.getTime())) return { short: "", full: "" };
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();
  const dayCrossed = !isSameDay(target, now);
  const timeFormatter = createTimeFormatter(locale);
  const dateTimeFormatter = createDateTimeFormatter(locale);
  const relativeLabels = labels || {
    today: runtimeT("timeline.time.today"),
    yesterday: runtimeT("timeline.time.yesterday"),
  };
  const hhmm = timeFormatter.format(target);
  const full = dateTimeFormatter.format(target);

  if (diffMs > 24 * 60 * 60 * 1000) {
    return { short: full, full };
  }

  if (diffMs >= 0 && dayCrossed && isYesterday(target, now)) {
    return { short: `${relativeLabels.yesterday} ${hhmm}`, full };
  }

  if (diffMs >= 0 && !dayCrossed) {
    return { short: `${relativeLabels.today} ${hhmm}`, full };
  }

  return {
    short: hhmm,
    full,
  };
}

export const SteerIcon: React.FC = () => {
  return <MaterialIcon name="reply" />;
};

function isCommandMessageVariant(
  variant?: TimelineNode["messageVariant"],
): variant is "steer" | "remember" | "learn" {
  return variant === "steer" || variant === "remember" || variant === "learn";
}

function getCommandMessageLabel(
  variant?: TimelineNode["messageVariant"],
): string {
  if (variant === "remember") return "/remember";
  if (variant === "learn") return "/learn";
  return "";
}

function getTimelineAttachmentSubtitle(
  attachment: NonNullable<TimelineNode["attachments"]>[number],
  t: (key: string) => string,
  compact = false,
): string {
  if (compact) {
    return getAttachmentKindLabel(attachment, t);
  }

  const attachmentSize = formatAttachmentSize(
    getAttachmentSizeBytes(attachment),
  );
  if (
    getAttachmentKind(attachment) === "image" &&
    String(attachment.url || "").trim()
  ) {
    return "";
  }

  return [getAttachmentKindLabel(attachment, t), attachmentSize]
    .filter(Boolean)
    .join(" · ");
}

const NodeIcon: React.FC<{
  kind: string;
  role?: string;
  messageVariant?: TimelineNode["messageVariant"];
}> = ({ kind, role, messageVariant }) => {
  if (isCommandMessageVariant(messageVariant)) {
    return (
      <span className={NODE_ICON_STEER_CLASS_NAME}>
        <SteerIcon />
      </span>
    );
  }

  let className = `${NODE_ICON_BASE_CLASS_NAME} ${NODE_ICON_CLASS_BY_KIND.assistant}`;
  let iconName: MaterialIconName = "smart_toy";

  switch (kind) {
    case "thinking":
      className = `${NODE_ICON_BASE_CLASS_NAME} ${NODE_ICON_CLASS_BY_KIND.thinking}`;
      iconName = "psychology";
      break;
    case "awaiting-answer":
      className = `${NODE_ICON_BASE_CLASS_NAME} ${NODE_ICON_CLASS_BY_KIND["awaiting-answer"]}`;
      iconName = "question_answer";
      break;
    case "tool":
      className = `${NODE_ICON_BASE_CLASS_NAME} ${NODE_ICON_CLASS_BY_KIND.tool}`;
      iconName = "build";
      break;
    case "content":
      className = `${NODE_ICON_BASE_CLASS_NAME} ${NODE_ICON_CLASS_BY_KIND.content}`;
      iconName = "description";
      break;
    case "source":
      className = `${NODE_ICON_BASE_CLASS_NAME} ${NODE_ICON_CLASS_BY_KIND.source}`;
      iconName = "search";
      break;
    default:
      if (role === "system") {
        className = `${NODE_ICON_BASE_CLASS_NAME} ${NODE_ICON_CLASS_BY_KIND.alert}`;
        iconName = "warning";
      } else {
        className = `${NODE_ICON_BASE_CLASS_NAME} ${NODE_ICON_CLASS_BY_KIND.assistant}`;
        iconName = "smart_toy";
      }
  }

  return (
    <span className={className}>
      <MaterialIcon name={iconName} />
    </span>
  );
};

export const TimelineRow: React.FC<TimelineRowProps> = ({
  node,
  toolGroup,
  showTime = false,
  metaNode,
}) => {
  const { locale, t } = useI18n();
  const openTarget = useOpenTarget();
  const timeTarget = node || toolGroup?.nodes[toolGroup.nodes.length - 1];
  if (!timeTarget) return null;
  const taskID =
    node?.taskId || toolGroup?.nodes.find((item) => item.taskId)?.taskId;
  const anchorNodeId = node?.id || toolGroup?.nodes[0]?.id || undefined;

  const time = formatTimelineTime(timeTarget.ts, locale, {
    today: t("timeline.time.today"),
    yesterday: t("timeline.time.yesterday"),
  });
  const timeNode =
    metaNode ||
    (showTime && time.short ? (
      <div className={TIMELINE_ROW_TIME_CLASS_NAME} title={time.full}>
        {time.short}
      </div>
    ) : null);

  /* User messages */
  if (
    node &&
    node.kind === "message" &&
    node.role === "user" &&
    !isCommandMessageVariant(node.messageVariant)
  ) {
    const attachmentItems = Array.isArray(node.attachments)
      ? node.attachments.filter((attachment) =>
          Boolean(String(attachment?.name || "").trim()),
        )
      : [];
    const hasText = Boolean(String(node.text || "").trim());
    const hasMultipleAttachments = attachmentItems.length > 1;

    return (
      <div
        className={TIMELINE_ROW_USER_CLASS_NAME}
        data-kind="message"
        data-role="user"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        <div className={TIMELINE_USER_STACK_CLASS_NAME}>
          {attachmentItems.length > 0 && (
            <div
              className={[
                TIMELINE_USER_ATTACHMENTS_BASE_CLASS_NAME,
                TIMELINE_USER_ATTACHMENTS_SINGLE_CLASS_NAME,
              ].join(" ")}
            >
              {attachmentItems.map((attachment, index) =>
                attachment.type === "chat" || attachment.type === "site" ? (
                  <ReferenceCard
                    key={`${attachment.type}_${attachment.id || attachment.name}_${index}`}
                    reference={attachment}
                    variant="timeline"
                    density={hasMultipleAttachments ? "compact" : "default"}
                  />
                ) : (
                  <AttachmentCard
                    key={`${attachment.name}_${index}`}
                    attachment={attachment}
                    variant="timeline"
                    density={hasMultipleAttachments ? "compact" : "default"}
                    thumbnailMode="inline"
                    displayMode={hasMultipleAttachments ? "file" : "auto"}
                    subtitle={getTimelineAttachmentSubtitle(
                      attachment,
                      t,
                      hasMultipleAttachments,
                    )}
                  />
                ),
              )}
            </div>
          )}
          {node.mustUseSkills && node.mustUseSkills.length > 0 && (
            <Flex wrap gap={4} justify="flex-end">
              {node.mustUseSkills.map((key) => (
                <UiButton
                  key={key.toLowerCase()}
                  variant="ghost"
                  className="tw:!bg-accent-soft tw:!px-[6px] tw:!py-0 tw:!min-h-[24px] tw:!rounded-[4px]"
                  size="sm"
                  onClick={() =>
                    openTarget({
                      version: 1,
                      kind: "skill",
                      key,
                      label: key,
                    })
                  }
                >
                  <Flex gap={4} align="center">
                    <MaterialIcon
                      name="skills"
                      className="tw:text-accent tw:text-[14px]"
                    />
                    <span className="tw:text-text-sub">{key}</span>
                  </Flex>
                </UiButton>
              ))}
            </Flex>
          )}
          {hasText && <UserBubble text={node.text || ""} targetId={node.id} />}
          {timeNode}
        </div>
      </div>
    );
  }

  if (
    node &&
    node.kind === "message" &&
    node.role === "user" &&
    isCommandMessageVariant(node.messageVariant)
  ) {
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="message"
        data-role="user"
        data-variant="steer"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        <div className={TIMELINE_MARKER_CLASS_NAME}>
          <NodeIcon
            kind="message"
            role="user"
            messageVariant={node.messageVariant}
          />
        </div>
        <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
          <div className={TIMELINE_COMMAND_LABEL_CLASS_NAME}>
            {getCommandMessageLabel(node.messageVariant)}
          </div>
          <UserBubble
            text={node.text || ""}
            targetId={node.id}
            variant={node.messageVariant}
          />
          {timeNode}
        </div>
      </div>
    );
  }

  /* System alerts */
  if (node && node.kind === "message" && node.role === "system") {
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="message"
        data-role="system"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        <div className={TIMELINE_MARKER_CLASS_NAME}>
          <NodeIcon kind="message" role="system" />
        </div>
        <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
          <SystemAlert text={node.text || ""} errorDetail={node.errorDetail} />
          {timeNode}
        </div>
      </div>
    );
  }

  /* Thinking */
  if (node && node.kind === "thinking") {
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="thinking"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        <div className={TIMELINE_MARKER_CLASS_NAME}>
          <NodeIcon kind="thinking" />
        </div>
        <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
          <ThinkingBlock node={node} />
          {timeNode}
        </div>
      </div>
    );
  }

  /* Awaiting answer */
  if (node && node.kind === "awaiting-answer") {
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="awaiting-answer"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        <div className={TIMELINE_MARKER_CLASS_NAME}>
          <NodeIcon kind="awaiting-answer" />
        </div>
        <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
          <AwaitingAnswerBlock node={node} />
          {timeNode}
        </div>
      </div>
    );
  }

  /* Tool */
  if (toolGroup || (node && node.kind === "tool")) {
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="tool"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        <div className={TIMELINE_MARKER_CLASS_NAME}>
          <NodeIcon kind="tool" />
        </div>
        <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
          <ToolPill node={node} toolGroup={toolGroup} />
          {timeNode}
        </div>
      </div>
    );
  }

  /* Content */
  if (node && node.kind === "content") {
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="content"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        <div className={TIMELINE_MARKER_CLASS_NAME}>
          <NodeIcon kind="content" />
        </div>
        <div
          className={`${TIMELINE_FLOW_CONTENT_CLASS_NAME} ${TIMELINE_CONTENT_FLOW_CLASS_NAME}`}
        >
          <ContentBlock node={node} />
          {timeNode}
        </div>
      </div>
    );
  }

  /* Source */
  if (node && node.kind === "source") {
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="source"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        <div className={TIMELINE_MARKER_CLASS_NAME}>
          <NodeIcon kind="source" />
        </div>
        <div
          className={`${TIMELINE_FLOW_CONTENT_CLASS_NAME} ${TIMELINE_SOURCE_FLOW_CLASS_NAME}`}
        >
          <SourceBlock node={node} />
          {timeNode}
        </div>
      </div>
    );
  }

  /* Planning */
  if (node && node.kind === "planning") {
    return (
      <div
        className={TIMELINE_ROW_PLANNING_CLASS_NAME}
        data-kind="planning"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        <div className={TIMELINE_MARKER_CLASS_NAME}>
          <span className={NODE_ICON_PLANNING_CLASS_NAME}>
            <MaterialIcon name="assignment" />
          </span>
        </div>
        <PlanningTimeline node={node} />
      </div>
    );
  }

  /* Default assistant message */
  return (
    <div
      className={TIMELINE_ROW_FLOW_CLASS_NAME}
      data-kind={node?.kind}
      data-role={node?.role}
      data-node-id={anchorNodeId}
      data-task-id={taskID || undefined}
    >
      <div className={TIMELINE_MARKER_CLASS_NAME}>
        <NodeIcon kind={node?.kind || "message"} role={node?.role} />
      </div>
      <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
        {node && <ContentBlock node={node} />}
        {timeNode}
      </div>
    </div>
  );
};
