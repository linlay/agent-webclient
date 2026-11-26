import { bindCssModuleClasses } from "@/shared/utils/cssModuleClasses";
import timelinePresentation from "@/features/timeline/components/TimelinePresentation.module.css";
import { MailBadge } from "./MailBadge";
import { InboundMessage } from "./InboundMessage";
import { SnapshotSteerMessage } from "./SnapshotSteerMessage";
import { RelatedChatCards } from "./RelatedChatCards";
import type { Agent } from "@/features/agents/lib/agentState";
import { TimelineToolIcon } from "./TimelineToolIcon";
import { WaitCard } from "./WaitCard";
import { ImageGenerationCard } from "./ImageGenerationCard";
import { RunActivityIcon } from "./RunActivityIcon";
import { isImageGenerationTool } from "../lib/imageGenerationDisplay";
import React from "react";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import type { TimelineRenderEntry } from "@/features/timeline/lib/timelineDisplay";
import {
  formatAttachmentSize,
  getAttachmentKind,
  getAttachmentKindLabel,
  getAttachmentSizeBytes,
} from "@/features/artifacts/lib/attachmentUtils";
import { ReferenceCard } from "@/features/artifacts/components/ReferenceCard";
import { UserBubble } from "@/features/timeline/components/UserBubble";
import { ThinkingBlock } from "@/features/timeline/components/ThinkingBlock";
import { AwaitingAnswerBlock } from "@/features/timeline/components/AwaitingAnswerBlock";
import { ToolPill } from "@/features/timeline/components/ToolPill";
import { ContentBlock } from "@/features/timeline/components/ContentBlock";
import { SourceBlock } from "@/features/timeline/components/SourceBlock";
import { SystemAlert } from "@/features/timeline/components/SystemAlert";
import { TimelineActivityText } from "./TimelineActivityText";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { t as runtimeT, useI18n, type Locale } from "@/shared/i18n";
import { PlanningTimeline } from "./planning";
import { SelectedTextFragmentsPill } from "@/features/selection/components/SelectedTextFragmentsPill";
import { selectedTextFragmentFromAttachment } from "@/features/selection/lib/selectedTextReference";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import type { AgentSkill } from "@/shared/data/api/dto/agents";
import { resolveSkillDisplayName, resolveSkillIconUrl } from "@/features/skills/lib/skillDisplayName";
import { SteerIcon } from "@/features/runs/components/SteerIcon";
const presentationClasses = bindCssModuleClasses({ ...timelinePresentation });


type ToolGroupRenderEntry = Extract<
  TimelineRenderEntry,
  { kind: "tool-group" }
>;

interface TimelineRowProps {
  agents?: Agent[];
  node?: TimelineNode;
  toolGroup?: ToolGroupRenderEntry;
  showTime?: boolean;
  metaNode?: React.ReactNode;
  skills?: readonly AgentSkill[];
}

const EMPTY_AGENT_SKILLS: readonly AgentSkill[] = [];

const TIMELINE_ROW_BASE_CLASS_NAME = presentationClasses("timeline-row tw:relative");
const TIMELINE_ROW_USER_CLASS_NAME = `${TIMELINE_ROW_BASE_CLASS_NAME} timeline-row-user tw:ml-auto tw:max-w-[87%] tw:pl-5`;
// 交互请示不是用户气泡：卡片自带操作面，整行与左侧流程内容同起点。
const TIMELINE_ROW_ASK_CLASS_NAME = `${TIMELINE_ROW_BASE_CLASS_NAME} timeline-row-ask`;
const TIMELINE_ROW_FLOW_CLASS_NAME = `${TIMELINE_ROW_BASE_CLASS_NAME} timeline-row-flow tw:grid tw:grid-cols-[18px_minmax(0,1fr)] tw:items-start tw:gap-2.5 tw:mb-[2px]`;
const TIMELINE_USER_STACK_CLASS_NAME =
  "timeline-user-stack tw:flex tw:min-w-0 tw:flex-col tw:items-end tw:gap-2";
const TIMELINE_ASK_STACK_CLASS_NAME =
  "timeline-user-stack tw:flex tw:min-w-0 tw:flex-col tw:items-start tw:gap-2";
const TIMELINE_USER_ATTACHMENTS_BASE_CLASS_NAME =
  "timeline-user-attachments tw:w-full tw:justify-end";
const TIMELINE_USER_ATTACHMENTS_SINGLE_CLASS_NAME = "tw:flex tw:gap-2.5 tw:flex-wrap";
const TIMELINE_MARKER_CLASS_NAME = "timeline-marker tw:relative tw:flex tw:self-stretch";
/** 卡片类行：图标与卡片中线对齐，而不是贴着自己的首行文字。 */
const TIMELINE_MARKER_CENTERED_CLASS_NAME = `${TIMELINE_MARKER_CLASS_NAME} tw:items-center`;
// wait 卡片比图标高，连线从图标下沿重新开始，避免竖线穿过图标。
const TIMELINE_ROW_WAIT_CLASS_NAME = `${TIMELINE_ROW_FLOW_CLASS_NAME} timeline-row-wait`;
const NODE_ICON_BASE_CLASS_NAME =
  "node-icon tw:relative tw:z-[2] tw:inline-flex tw:h-[18px] tw:w-[18px] tw:items-center tw:justify-center tw:[&_.material-icon]:text-lg tw:[&_svg]:block tw:[&_svg]:h-[18px] tw:[&_svg]:w-[18px] tw:[&_svg]:stroke-current tw:[&_svg]:stroke-[1.8] tw:[&_svg]:[stroke-linecap:round] tw:[&_svg]:[stroke-linejoin:round]";
const NODE_ICON_STEER_CLASS_NAME = `${NODE_ICON_BASE_CLASS_NAME} node-icon-steer tw:text-accent-electric tw:rounded-full`;
const NODE_ICON_PLANNING_CLASS_NAME = `${NODE_ICON_BASE_CLASS_NAME} node-icon-planning tw:text-accent-electric-strong tw:rounded-full`;
/** 节点种类 → 图标与色调。色调只给 tw: 颜色类，外框尺寸统一由 NODE_ICON_BASE_CLASS_NAME 提供。 */
const NODE_ICON_BY_KIND: Record<string, { icon: MaterialIconName; tone: string }> = {
  thinking: { icon: "psychology", tone: "node-icon-thinking tw:text-accent-warn" },
  "awaiting-answer": { icon: "question_answer", tone: "node-icon-awaiting-answer tw:text-accent-warn" },
  tool: { icon: "build", tone: "node-icon-tool tw:text-accent-electric-strong" },
  content: { icon: "description", tone: "node-icon-content tw:text-accent-lime" },
  source: { icon: "search", tone: "node-icon-source tw:text-accent-electric-strong" },
};
const NODE_ICON_TONE_SYSTEM_INFO = "node-icon-info tw:text-ink-muted";
const NODE_ICON_TONE_SYSTEM_ALERT = "node-icon-alert tw:text-accent-danger";
const NODE_ICON_TONE_ASSISTANT = "node-icon-assistant tw:text-accent-electric";
const TIMELINE_FLOW_CONTENT_CLASS_NAME =
  "timeline-flow-content tw:flex tw:min-w-0 tw:flex-col tw:gap-2 tw:rounded-none tw:border-0 tw:bg-transparent tw:p-0 tw:shadow-none";
const TIMELINE_CONTENT_FLOW_CLASS_NAME =
  "tw:w-[min(100%,820px)] tw:max-w-[820px]";
const TIMELINE_SOURCE_FLOW_CLASS_NAME =
  "tw:w-[min(100%,760px)] tw:max-w-[760px]";
const TIMELINE_ROW_TIME_CLASS_NAME =
  presentationClasses("timeline-row-time tw:ml-auto tw:shrink-0 tw:pl-2 tw:text-[12px] tw:leading-none tw:text-ink-muted tw:tracking-[0.02em]");
const TIMELINE_INLINE_ICON_CLASS_NAME = "timeline-inline-icon";
const TIMELINE_INLINE_ROW_CLASS_NAME = "timeline-inline-row";
const TIMELINE_INLINE_ROW_CENTERED_CLASS_NAME = `${TIMELINE_INLINE_ROW_CLASS_NAME} timeline-inline-row-center`;
const TIMELINE_INLINE_ROW_ACTIVITY_CLASS_NAME = `${TIMELINE_INLINE_ROW_CLASS_NAME} timeline-inline-row-activity`;
const TIMELINE_COMMAND_LABEL_CLASS_NAME =
  "timeline-command-label tw:mt-[9px] tw:font-code tw:text-[11px] tw:font-bold tw:leading-none tw:tracking-[0.06em] tw:text-accent-electric-strong tw:uppercase tw:empty:hidden";

export interface TimelineActivityRowProps {
  text: string;
  nodeId?: string;
  taskId?: string;
  /** Marks the synthetic transition row shown while a run has nothing else to display. */
  placeholder?: boolean;
}

/** 行内图标行：图标与内容并排，供简单档的系统提示、卡片类行与活动行共用。 */
const TimelineInlineRow: React.FC<{
  icon: React.ReactNode;
  children: React.ReactNode;
  /** 卡片类行：图标与卡片垂直居中，而不是贴在卡片首行。 */
  centered?: boolean;
  /** 活动头像按 32px 绘制、宽于 18px 行内槽，需要比普通行更大的图标-文案间距。 */
  activity?: boolean;
}> = ({ icon, children, centered = false, activity = false }) => (
  <div className={activity ? TIMELINE_INLINE_ROW_ACTIVITY_CLASS_NAME
    : centered ? TIMELINE_INLINE_ROW_CENTERED_CLASS_NAME : TIMELINE_INLINE_ROW_CLASS_NAME}>
    <span className={TIMELINE_INLINE_ICON_CLASS_NAME}>{icon}</span>
    <div>{children}</div>
  </div>
);

/** Shared progress line used by live run.activity nodes and the empty-run transition. */
export function TimelineActivityRow({
  text,
  nodeId,
  taskId,
  placeholder = false,
}: TimelineActivityRowProps) {
  const interaction = useTimelineInteraction();
  const compact = interaction?.detailLevel === "simple";
  const activityIcon = <RunActivityIcon {...interaction?.activityAppearance} />;
  const textNode = <TimelineActivityText text={text} />;
  return (
    <div
      className={TIMELINE_ROW_FLOW_CLASS_NAME}
      data-kind="activity"
      data-placeholder={placeholder ? "true" : undefined}
      data-node-id={nodeId}
      data-task-id={taskId || undefined}
    >
      {compact ? null : (
        <div className={TIMELINE_MARKER_CLASS_NAME}>{activityIcon}</div>
      )}
      <div
        className={`${TIMELINE_FLOW_CONTENT_CLASS_NAME} tw:text-[13px]`}
        role="status"
        aria-live="polite"
      >
        {compact ? (
          <TimelineInlineRow icon={activityIcon} activity>{textNode}</TimelineInlineRow>
        ) : (
          textNode
        )}
      </div>
    </div>
  );
}

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
  systemMessageLevel?: TimelineNode["systemMessageLevel"];
}> = ({ kind, role, messageVariant, systemMessageLevel }) => {
  if (isCommandMessageVariant(messageVariant)) {
    return (
      <span className={NODE_ICON_STEER_CLASS_NAME}>
        <SteerIcon />
      </span>
    );
  }

  const isSystem = role === "system";
  const isInfo = systemMessageLevel === "info";
  const entry = isSystem ? undefined : NODE_ICON_BY_KIND[kind];
  const tone = isSystem
    ? (isInfo ? NODE_ICON_TONE_SYSTEM_INFO : NODE_ICON_TONE_SYSTEM_ALERT)
    : (entry?.tone ?? NODE_ICON_TONE_ASSISTANT);
  const iconName: MaterialIconName = isSystem
    ? (isInfo ? (messageVariant === "compact" ? "compress" : "info") : "warning")
    : (entry?.icon ?? "smart_toy");

  return (
    <span className={`${NODE_ICON_BASE_CLASS_NAME} ${tone} tw:rounded-full`}>
      <MaterialIcon name={iconName} />
    </span>
  );
};

export const TimelineRow: React.FC<TimelineRowProps> = ({
  node,
  toolGroup,
  showTime = false,
  metaNode,
  skills,
  agents = [],
}) => {
  const { locale, t } = useI18n();
  const activeAgentSkills = skills ?? EMPTY_AGENT_SKILLS;
  const interaction = useTimelineInteraction();
  /** 简单档：图标行内进各块头部，不再占图标列（展开体因此天然从正文左边缘开始）。 */
  const compact = interaction?.detailLevel === "simple";
  const markerSlot = (icon: React.ReactNode, centered = false): React.ReactNode =>
    compact ? null : (
      <div className={centered ? TIMELINE_MARKER_CENTERED_CLASS_NAME : TIMELINE_MARKER_CLASS_NAME}>{icon}</div>
    );
  const iconSlot = (icon: React.ReactNode): React.ReactNode =>
    compact ? <span className={TIMELINE_INLINE_ICON_CLASS_NAME}>{icon}</span> : undefined;
  /** 没有折叠头部的行（系统提示、卡片类工具结果）：简单档用行内图标 + 内容并排。 */
  const inlineRow = (icon: React.ReactNode, content: React.ReactNode, centered = false): React.ReactNode =>
    compact ? <TimelineInlineRow icon={icon} centered={centered}>{content}</TimelineInlineRow> : content;
  const timeTarget = node || toolGroup?.nodes[toolGroup.nodes.length - 1];
  if (!timeTarget) return null;
  const taskID =
    node?.taskId || toolGroup?.nodes.find((item) => item.taskId)?.taskId;
  const anchorNodeId = node?.id || toolGroup?.nodes[0]?.id || undefined;

  const time = formatTimelineTime(timeTarget.ts, locale, {
    today: t("timeline.time.today"),
    yesterday: t("timeline.time.yesterday"),
  });
  // 交互请示行自己带可操作的邮件卡片，复制/重发等 meta 行在那里没有意义，
  // 时间也一并省略，避免请示卡片旁边挂一排无主操作。
  const hideMetaRow = node?.mail?.kind === "ask";
  const timeNode = hideMetaRow
    ? null
    : metaNode ||
      (showTime && time.short ? (
        <div className={TIMELINE_ROW_TIME_CLASS_NAME} title={time.full}>
          {time.short}
        </div>
      ) : null);

  // 交互请示只渲染一张卡片：卡片 header 已经带了来源与跳转，行内不再重复徽标。
  const mailAskNode =
    node?.mail?.kind === "ask" && !interaction?.readOnly
      ? interaction?.renderMailAsk?.(node.mail.id, node.mail)
      : null;

  /* Input another Agent delivered: a muted line, never a user bubble */
  if (node && node.kind === "message" && node.role === "user" && node.inbound) {
    return <InboundMessage node={{ ...node, inbound: node.inbound }} agents={agents} timeNode={timeNode} />;
  }

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
    const selectedTextFragments = attachmentItems.flatMap((attachment) => {
      const fragment = selectedTextFragmentFromAttachment(attachment);
      return fragment ? [fragment] : [];
    });
    const visibleAttachmentItems = attachmentItems.filter(
      (attachment) => attachment.type !== "selection",
    );
    const hasText = Boolean(String(node.text || "").trim());
    const hasMultipleAttachments = visibleAttachmentItems.length > 1;
    const isMailAskRow = node.mail?.kind === "ask";

    return (
      <div
        className={
          isMailAskRow ? TIMELINE_ROW_ASK_CLASS_NAME : TIMELINE_ROW_USER_CLASS_NAME
        }
        data-kind="message"
        data-role="user"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        <div
          className={
            isMailAskRow
              ? TIMELINE_ASK_STACK_CLASS_NAME
              : TIMELINE_USER_STACK_CLASS_NAME
          }
        >
          {/* 卡片自带来源与跳转，徽标只在宿主无法渲染卡片时兜底。 */}
          {node.mail && !mailAskNode && (
            <MailBadge mail={node.mail} agents={agents} />
          )}
          {mailAskNode}
          {/* 消息发出后引用只是记录：可以回看文本与批注，但不再提供"跳回原文"的定位，避免把已读的这一行再滚走。 */}
          <SelectedTextFragmentsPill
            fragments={selectedTextFragments}
            variant="segments"
            locatable={false}
          />
          {visibleAttachmentItems.length > 0 && (
            <div
              className={[
                TIMELINE_USER_ATTACHMENTS_BASE_CLASS_NAME,
                TIMELINE_USER_ATTACHMENTS_SINGLE_CLASS_NAME,
              ].join(" ")}
            >
              {visibleAttachmentItems.map((attachment, index) => (
                <React.Fragment key={`${attachment.name}_${index}`}>
                  {interaction?.renderAttachment?.(attachment, {
                    displayMode: hasMultipleAttachments ? "file" : "auto",
                    subtitle: getTimelineAttachmentSubtitle(attachment, t, hasMultipleAttachments),
                    skillIcon: attachment.type === "skill" ? resolveSkillIconUrl(activeAgentSkills, String(attachment.id || attachment.name || "")) : undefined,
                  }) ?? (["chat", "url", "skill", "kbase"].includes(attachment.type || "")
                    ? <ReferenceCard reference={attachment} variant="timeline" openTarget={interaction?.openTarget} />
                    : <span>{attachment.name}</span>)}
                </React.Fragment>
              ))}
            </div>
          )}

          {hasText && node.mail?.kind !== "ask" && <UserBubble text={node.text || ""} targetId={node.id} />}
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
    const commandIcon = (
      <NodeIcon kind="message" role="user" messageVariant={node.messageVariant} />
    );
    const commandLabel = node.mail
      ? mailAskNode
        ? null
        : <MailBadge mail={node.mail} agents={agents} />
      : getCommandMessageLabel(node.messageVariant);
    const commandText = String(node.text || "").trim();
    const steerAttachments = node.attachments || [];
    // 多个附件时图片退成文件卡片：一张大图会把整行撑满，其它引用被挤到看不见。
    const multipleAttachments = steerAttachments.length > 1;
    const commandAttachments = steerAttachments.length > 0 ? (
      <div className="tw:flex tw:flex-wrap tw:gap-1">
        {steerAttachments.map((attachment, index) => (
          <React.Fragment key={attachment.id || index}>
            {interaction?.renderAttachment?.(
              attachment,
              multipleAttachments
                ? {
                    displayMode: "file",
                    subtitle: getTimelineAttachmentSubtitle(attachment, t, true),
                  }
                : {},
            ) ?? <span>{attachment.name}</span>}
          </React.Fragment>
        ))}
      </div>
    ) : null;
    // 纯附件的引导没有正文：空气泡只是空壳，直接不渲染。
    const commandBubble = node.mail?.kind !== "ask" && commandText ? (
      <UserBubble
        text={node.text || ""}
        targetId={node.id}
        variant={node.messageVariant}
      />
    ) : null;
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="message"
        data-role="user"
        data-variant="steer"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        {markerSlot(commandIcon)}
        <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
          {node.steerSource ? <SnapshotSteerMessage node={node} source={node.steerSource} /> : (
            <>
              {compact ? (
                <>
                  {/* 有正文：附件单独占一行，图标只与气泡（或指令名）同一行，
                      附件与图标同一条左边缘。 */}
                  {commandBubble ? commandAttachments : null}
                  <div className={TIMELINE_INLINE_ROW_CLASS_NAME}>
                    {iconSlot(commandIcon)}
                    <div>
                      {commandLabel && (
                        <div className={TIMELINE_COMMAND_LABEL_CLASS_NAME}>{commandLabel}</div>
                      )}
                      {mailAskNode}
                      {/* 无正文时没有气泡可对齐，图标直接排到附件左边。 */}
                      {commandBubble ?? commandAttachments}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className={TIMELINE_COMMAND_LABEL_CLASS_NAME}>{commandLabel}</div>
                  {mailAskNode}
                  {commandAttachments}
                  {commandBubble}
                </>
              )}
              {timeNode}
            </>
          )}
        </div>
      </div>
    );
  }

  /* Progress activity: one line saying what the Run is doing now */
  if (node && node.kind === "message" && node.role === "system" && node.systemMessageLevel === "activity") {
    return (
      <TimelineActivityRow
        text={node.text || ""}
        nodeId={anchorNodeId}
        taskId={taskID}
      />
    );
  }

  /* System messages */
  if (node && node.kind === "message" && node.role === "system") {
    const systemIcon = <NodeIcon kind="message" role="system" messageVariant={node.messageVariant} systemMessageLevel={node.systemMessageLevel} />;
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="message"
        data-role="system"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        {markerSlot(systemIcon)}
        <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
          {inlineRow(
            systemIcon,
            <SystemAlert
              level={node.systemMessageLevel}
              text={node.text || ""}
              tooltip={node.tooltip}
              errorDetail={node.errorDetail}
            />,
          )}
          {timeNode}
        </div>
      </div>
    );
  }

  /* Thinking */
  if (node && node.kind === "thinking") {
    const thinkingIcon = <NodeIcon kind="thinking" />;
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="thinking"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        {markerSlot(thinkingIcon)}
        <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
          <ThinkingBlock node={node} icon={iconSlot(thinkingIcon)} />
          {timeNode}
        </div>
      </div>
    );
  }

  /* Awaiting answer */
  if (node && node.kind === "awaiting-answer") {
    const awaitingIcon = <NodeIcon kind="awaiting-answer" />;
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="awaiting-answer"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        {markerSlot(awaitingIcon)}
        <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
          {node.delegatedBy && <p>
            {t("mailbox.delegated", {agent: node.delegatedBy})}
            {node.delegatedLevel && ` · ${t("mailbox.grant", {level: node.delegatedLevel})}`}
          </p>}
          <AwaitingAnswerBlock node={node} icon={iconSlot(awaitingIcon)} />
          {timeNode}
        </div>
      </div>
    );
  }

  /* Tool */
  if (toolGroup || (node && node.kind === "tool")) {
    const waitNode = node?.toolName === "wait" ? node : null;
    const toolIcon = (
      <TimelineToolIcon
        toolNames={(toolGroup?.nodes || (node ? [node] : [])).map((item) => item.toolName)}
        className={`${NODE_ICON_BASE_CLASS_NAME} ${NODE_ICON_BY_KIND.tool.tone} tw:rounded-full`}
      />
    );
    return (
      <div
        className={waitNode ? TIMELINE_ROW_WAIT_CLASS_NAME : TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="tool"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        {markerSlot(toolIcon, Boolean(waitNode))}
        <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
          {waitNode ? inlineRow(toolIcon, <WaitCard node={waitNode} active={Boolean(interaction?.conversationActive)} />, true) : (toolGroup?.nodes || (node ? [node] : [])).every(isImageGenerationTool) ? (
            inlineRow(toolIcon, <ImageGenerationCard nodes={toolGroup?.nodes || [node!]} />)
          ) : node?.toolName === "run_query" && node.relatedChat && node.relatedChat.chatId !== interaction?.surfaceContext?.chatId ? (
            inlineRow(toolIcon, <RelatedChatCards nodes={[node]} agents={agents} />)
          ) : <ToolPill node={node} toolGroup={toolGroup} icon={iconSlot(toolIcon)} />}
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
        {markerSlot(<NodeIcon kind="content" />)}
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
    const sourceIcon = <NodeIcon kind="source" />;
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="source"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        {markerSlot(sourceIcon)}
        <div
          className={`${TIMELINE_FLOW_CONTENT_CLASS_NAME} ${TIMELINE_SOURCE_FLOW_CLASS_NAME}`}
        >
          <SourceBlock node={node} icon={iconSlot(sourceIcon)} />
          {timeNode}
        </div>
      </div>
    );
  }

  /* Planning */
  if (node && node.kind === "planning") {
    const planningIcon = (
      <span className={NODE_ICON_PLANNING_CLASS_NAME}>
        <MaterialIcon name="assignment" />
      </span>
    );
    return (
      <div
        className={TIMELINE_ROW_FLOW_CLASS_NAME}
        data-kind="planning"
        data-node-id={anchorNodeId}
        data-task-id={taskID || undefined}
      >
        {markerSlot(planningIcon)}
        <PlanningTimeline node={node} icon={iconSlot(planningIcon)} />
      </div>
    );
  }

  /* Default assistant message */
  const fallbackIcon = <NodeIcon kind={node?.kind || "message"} role={node?.role} />;
  return (
    <div
      className={TIMELINE_ROW_FLOW_CLASS_NAME}
      data-kind={node?.kind}
      data-role={node?.role}
      data-node-id={anchorNodeId}
      data-task-id={taskID || undefined}
    >
      {markerSlot(fallbackIcon)}
      <div className={TIMELINE_FLOW_CONTENT_CLASS_NAME}>
        {inlineRow(fallbackIcon, node ? <ContentBlock node={node} /> : null)}
        {timeNode}
      </div>
    </div>
  );
};
