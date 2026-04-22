import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Popover } from "antd";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import type { AgentEvent } from "@/app/state/types";
import { formatDebugTimestamp } from "@/shared/utils/debugTime";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

const COLLECTIBLE_EVENT_TYPES = new Set([
  "reasoning.start",
  "reasoning.delta",
  "reasoning.end",
  "content.start",
  "content.delta",
  "content.end",
  "tool.start",
  "tool.args",
  "tool.end",
  "action.start",
  "action.args",
  "action.end",
] as const);

const COLLECTIBLE_GROUP_EVENT_TYPES: Record<
  "reasoning" | "content" | "tool" | "action",
  Set<string>
> = {
  reasoning: new Set(["reasoning.start", "reasoning.delta", "reasoning.end"]),
  content: new Set(["content.start", "content.delta", "content.end"]),
  tool: new Set(["tool.start", "tool.args", "tool.end"]),
  action: new Set(["action.start", "action.args", "action.end"]),
};

const EVENT_GROUP_CONFIG = [
  { prefix: "chat.", idKey: "chatId", family: "chat" },
  { prefix: "request.", idKey: "requestId", family: "request" },
  { prefix: "run.", idKey: "runId", family: "run" },
  { prefix: "content.", idKey: "contentId", family: "content" },
  { prefix: "reasoning.", idKey: "reasoningId", family: "reasoning" },
  { prefix: "plan.", idKey: "planId", family: "plan" },
  { prefix: "task.", idKey: "taskId", family: "task" },
  { prefix: "tool.", idKey: "toolId", family: "tool" },
  { prefix: "action.", idKey: "actionId", family: "action" },
  { prefix: "artifact.", idKey: "runId", family: "artifact" },
  { prefix: "awaiting.", idKey: "awaitingId", family: "awaiting" },
] as const;

type EventGroupIdKey = (typeof EVENT_GROUP_CONFIG)[number]["idKey"];

interface EventGroupMeta {
  family: (typeof EVENT_GROUP_CONFIG)[number]["family"];
  idKey: EventGroupIdKey;
  idValue: string;
}

interface RelatedEventEntry {
  event: AgentEvent;
  index: number;
}

type CollectibleFamily = keyof typeof COLLECTIBLE_GROUP_EVENT_TYPES;
type CopyTarget = "eventJson" | "requestBody" | "systemPrompt" | "tools";
type CopyFeedbackState = "idle" | "copied" | "error";

interface DebugPreCallCopyPayloads {
  requestBodyText: string;
  systemPromptText: string;
  toolsText: string;
}

interface EventCopyMenuItem {
  target: CopyTarget;
  label: string;
  text: string;
}

function readEventIdValue(event: AgentEvent, idKey: EventGroupIdKey): string {
  const value = event[idKey];
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function resolveEventGroupMeta(
  event: AgentEvent | null,
): EventGroupMeta | null {
  if (!event) return null;

  const type = String(event.type || "").toLowerCase();
  const config = EVENT_GROUP_CONFIG.find((item) =>
    type.startsWith(item.prefix),
  );
  if (!config) return null;

  const idValue = readEventIdValue(event, config.idKey);
  if (!idValue) return null;

  return {
    family: config.family,
    idKey: config.idKey,
    idValue,
  };
}

function canCollectEvent(type: string): boolean {
  return COLLECTIBLE_EVENT_TYPES.has(String(type || "").toLowerCase() as never);
}

function isCollectibleFamily(family: EventGroupMeta["family"]): family is CollectibleFamily {
  return (
    family === "reasoning" ||
    family === "content" ||
    family === "tool" ||
    family === "action"
  );
}

function mapCollectedSnapshotType(type: string): string {
  const normalized = String(type || "").toLowerCase();
  if (normalized.startsWith("reasoning.")) return "reasoning.snapshot";
  if (normalized.startsWith("content.")) return "content.snapshot";
  if (normalized.startsWith("tool.")) return "tool.snapshot";
  if (normalized.startsWith("action.")) return "action.snapshot";
  return normalized;
}

function formatReadableTimestamp(timestamp?: number): string {
  return formatDebugTimestamp(timestamp);
}

function stringifyPopoverPayload(payload: unknown): string {
  return payload ? JSON.stringify(payload, null, 2) : "";
}

function readObjectValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("copy failed");
  }
}

function getCollectibleRelatedEvents(
  event: AgentEvent | null,
  groupMeta: EventGroupMeta | null,
  relatedEvents: RelatedEventEntry[],
): RelatedEventEntry[] {
  if (!event || !groupMeta || !isCollectibleFamily(groupMeta.family)) {
    return [];
  }
  if (!canCollectEvent(String(event.type || ""))) {
    return [];
  }

  const allowedTypes = COLLECTIBLE_GROUP_EVENT_TYPES[groupMeta.family];
  return relatedEvents.filter((entry) =>
    allowedTypes.has(String(entry.event.type || "").toLowerCase()),
  );
}

function readStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function extractTextParts(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextParts(item));
  }
  const record = readObjectValue(value);
  if (!record) {
    return [];
  }
  if (typeof record.text === "string") {
    return extractTextParts(record.text);
  }
  if (
    typeof record.value === "string" &&
    readStringValue(record.type).toLowerCase() === "text"
  ) {
    return extractTextParts(record.value);
  }
  return [];
}

function extractSystemPromptFromRequestBody(
  requestBody: Record<string, unknown>,
): string {
  const directPrompt = extractTextParts(requestBody.system).join("\n\n");
  if (directPrompt) {
    return directPrompt;
  }

  const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [];
  const openAIPrompt = messages
    .flatMap((message) => {
      const entry = readObjectValue(message);
      if (!entry || readStringValue(entry.role).toLowerCase() !== "system") {
        return [];
      }
      return extractTextParts(entry.content);
    })
    .join("\n\n");
  return openAIPrompt;
}

function copyTargetLabel(target: CopyTarget): string {
  switch (target) {
    case "eventJson":
      return "事件 JSON";
    case "requestBody":
      return "requestBody";
    case "systemPrompt":
      return "systemPrompt";
    case "tools":
      return "tools";
    default:
      return "";
  }
}

function resolveDebugPreCallCopyPayloads(
  event: AgentEvent | null,
): DebugPreCallCopyPayloads | null {
  if (!event || String(event.type || "").toLowerCase() !== "debug.precall") {
    return null;
  }
  const payload = readObjectValue(event.data);
  if (!payload) {
    return null;
  }
  const requestBody = readObjectValue(payload.requestBody);
  if (!requestBody) {
    return null;
  }

  const systemPromptText = extractSystemPromptFromRequestBody(requestBody);
  const toolsText = Array.isArray(requestBody.tools)
    ? JSON.stringify(requestBody.tools, null, 2)
    : "";

  return {
    requestBodyText: JSON.stringify(requestBody, null, 2),
    systemPromptText,
    toolsText,
  };
}

function buildEventCopyMenuItems(
  event: AgentEvent | null,
  rawJsonStr: string,
): EventCopyMenuItem[] {
  const items: EventCopyMenuItem[] = [];
  if (rawJsonStr) {
    items.push({
      target: "eventJson",
      label: "复制事件 JSON",
      text: rawJsonStr,
    });
  }

  const debugPreCallPayloads = resolveDebugPreCallCopyPayloads(event);
  if (!debugPreCallPayloads) {
    return items;
  }

  if (debugPreCallPayloads.requestBodyText) {
    items.push({
      target: "requestBody",
      label: "复制 requestBody",
      text: debugPreCallPayloads.requestBodyText,
    });
  }
  if (debugPreCallPayloads.systemPromptText) {
    items.push({
      target: "systemPrompt",
      label: "复制 systemPrompt",
      text: debugPreCallPayloads.systemPromptText,
    });
  }
  if (debugPreCallPayloads.toolsText) {
    items.push({
      target: "tools",
      label: "复制 tools",
      text: debugPreCallPayloads.toolsText,
    });
  }
  return items;
}

function buildCollectedSnapshot(
  event: AgentEvent,
  relatedEvents: RelatedEventEntry[],
): Record<string, unknown> {
  const mergedEvent = relatedEvents.reduce<Record<string, unknown>>(
    (acc, entry) => ({
      ...acc,
      ...entry.event,
    }),
    { ...event },
  );
  const lastEvent = relatedEvents[relatedEvents.length - 1]?.event || event;
  const snapshotType = mapCollectedSnapshotType(String(event.type || ""));
  const textFromDelta = relatedEvents
    .map((entry) => readStringValue(entry.event.delta))
    .join("");
  const fallbackText = [...relatedEvents]
    .reverse()
    .map((entry) => readStringValue(entry.event.text))
    .find(Boolean);
  const collectedArguments = (
    snapshotType === "tool.snapshot" || snapshotType === "action.snapshot"
  )
      ? relatedEvents
          .map((entry) => readStringValue(entry.event.delta))
          .join("")
      : "";
  const rawArgumentsFallback =
    snapshotType === "action.snapshot"
      ? readStringValue(mergedEvent.arguments) ||
        (() => {
          const actionParams = readObjectValue(mergedEvent.actionParams);
          return actionParams ? JSON.stringify(actionParams, null, 2) : "";
        })()
      : "";
  const textValue =
    snapshotType === "action.snapshot"
      ? readStringValue(lastEvent.text) || fallbackText
      : textFromDelta || fallbackText || readStringValue(lastEvent.text);

  const nextSnapshot: Record<string, unknown> = {
    ...mergedEvent,
    type: snapshotType,
    seq: lastEvent.seq ?? mergedEvent.seq,
    timestamp: lastEvent.timestamp ?? mergedEvent.timestamp,
  };

  if (textValue) {
    nextSnapshot.text = textValue;
  } else {
    delete nextSnapshot.text;
  }

  if (
    (snapshotType === "tool.snapshot" || snapshotType === "action.snapshot") &&
    (collectedArguments || rawArgumentsFallback)
  ) {
    nextSnapshot.arguments = collectedArguments || rawArgumentsFallback;
  }

  if (snapshotType === "action.snapshot") {
    delete nextSnapshot.result;
  }

  return nextSnapshot;
}

function resolveDisplayPayloadTimestamp(payload: unknown): number | undefined {
  const record = readObjectValue(payload);
  return typeof record?.timestamp === "number" ? record.timestamp : undefined;
}

function resolveInitialPopoverState(event: AgentEvent | null): {
  payload: Record<string, unknown> | AgentEvent | null;
  rawJsonStr: string;
  displayJsonStr: string;
} {
  const payload = event || null;
  const rawJsonStr = stringifyPopoverPayload(payload);
  return {
    payload,
    rawJsonStr,
    displayJsonStr: rawJsonStr,
  };
}

export const EventPopover: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<Map<CopyTarget, number>>(new Map());
  const [popoverState, setPopoverState] = useState(() =>
    resolveInitialPopoverState(state.eventPopoverEventRef),
  );
  const [copyStatus, setCopyStatus] = useState<Record<CopyTarget, CopyFeedbackState>>({
    eventJson: "idle",
    requestBody: "idle",
    systemPrompt: "idle",
    tools: "idle",
  });
  const [lastCopyTarget, setLastCopyTarget] = useState<CopyTarget>("eventJson");
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [position, setPosition] = useState({ top: 80, right: 320 });
  const isOpen = state.eventPopoverIndex >= 0 && !!state.eventPopoverEventRef;
  const event = state.eventPopoverEventRef;
  const groupMeta = useMemo(() => resolveEventGroupMeta(event), [event]);
  const relatedEvents = useMemo<RelatedEventEntry[]>(() => {
    if (!event) return [];
    if (!groupMeta) {
      return [{ event, index: state.eventPopoverIndex }];
    }

    const matches = state.events.flatMap((candidate, index) => {
      const candidateGroupMeta = resolveEventGroupMeta(candidate);
      if (
        !candidateGroupMeta ||
        candidateGroupMeta.family !== groupMeta.family ||
        candidateGroupMeta.idKey !== groupMeta.idKey ||
        candidateGroupMeta.idValue !== groupMeta.idValue
      ) {
        return [];
      }

      return [{ event: candidate, index }];
    });

    return matches.length > 0
      ? matches
      : [{ event, index: state.eventPopoverIndex }];
  }, [event, groupMeta, state.eventPopoverIndex, state.events]);
  const activeRelatedIndex = useMemo(() => {
    if (!event) return -1;

    const indexMatch = relatedEvents.findIndex(
      (entry) => entry.index === state.eventPopoverIndex,
    );
    if (indexMatch >= 0) return indexMatch;

    return relatedEvents.findIndex((entry) => entry.event === event);
  }, [event, relatedEvents, state.eventPopoverIndex]);
  const switcherSignature = useMemo(
    () => relatedEvents.map((entry) => entry.index).join(","),
    [relatedEvents],
  );
  const collectibleRelatedEvents = useMemo(
    () => getCollectibleRelatedEvents(event, groupMeta, relatedEvents),
    [event, groupMeta, relatedEvents],
  );
  const copyMenuItems = useMemo(
    () => buildEventCopyMenuItems(event, popoverState.rawJsonStr),
    [event, popoverState.rawJsonStr],
  );
  useEffect(() => {
    setPopoverState(resolveInitialPopoverState(event));
    copyTimerRef.current.forEach((timer) => window.clearTimeout(timer));
    copyTimerRef.current.clear();
    setCopyStatus({
      eventJson: "idle",
      requestBody: "idle",
      systemPrompt: "idle",
      tools: "idle",
    });
    setLastCopyTarget("eventJson");
    setCopyMenuOpen(false);
  }, [event]);

  useEffect(() => {
    return () => {
      copyTimerRef.current.forEach((timer) => window.clearTimeout(timer));
      copyTimerRef.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = popoverRef.current;
    if (!el) return;

    const updatePosition = () => {
      const margin = 8;
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      const width = Math.min(420, Math.max(260, viewW - margin * 2));
      el.style.width = `${width}px`;

      const anchor = state.eventPopoverAnchor ?? {
        x: Math.max(margin, viewW - width - margin),
        y: 80,
      };

      const height = el.offsetHeight || 320;
      const maxTop = Math.max(margin, viewH - height - margin);
      const top = Math.max(margin, Math.min(anchor.y + 8, maxTop));
      const maxLeft = Math.max(margin, viewW - width - margin);
      const left = Math.max(margin, Math.min(anchor.x, maxLeft));
      const right = Math.max(margin, viewW - left - width);
      setPosition({ top, right });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [isOpen, popoverState.displayJsonStr, state.eventPopoverAnchor, switcherSignature]);

  if (!isOpen || !event) {
    return null;
  }

  const seq = event.seq ?? "-";
  const groupSummary = groupMeta
    ? `${groupMeta.idKey}: ${groupMeta.idValue}`
    : "未识别分组";
  const showSwitcher = relatedEvents.length > 1;
  const showCollect = collectibleRelatedEvents.length > 1;
  const copyIcon =
    copyStatus[lastCopyTarget] === "copied" ? "check" : "content_copy";
  const readableTimestamp = formatReadableTimestamp(
    resolveDisplayPayloadTimestamp(popoverState.payload),
  );

  const handleCopy = (target: CopyTarget, text: string) => {
    if (!text) {
      return;
    }
    setLastCopyTarget(target);
    void copyText(text)
      .then(() => {
        const existing = copyTimerRef.current.get(target);
        if (existing) {
          window.clearTimeout(existing);
        }
        setCopyStatus((current) => ({ ...current, [target]: "copied" }));
        const timer = window.setTimeout(() => {
          setCopyStatus((current) => ({ ...current, [target]: "idle" }));
          copyTimerRef.current.delete(target);
        }, 1600);
        copyTimerRef.current.set(target, timer);
      })
      .catch(() => {
        const existing = copyTimerRef.current.get(target);
        if (existing) {
          window.clearTimeout(existing);
        }
        setCopyStatus((current) => ({ ...current, [target]: "error" }));
        const timer = window.setTimeout(() => {
          setCopyStatus((current) => ({ ...current, [target]: "idle" }));
          copyTimerRef.current.delete(target);
        }, 1600);
        copyTimerRef.current.set(target, timer);
      });
  };

  const copyMenuTitle =
    copyStatus[lastCopyTarget] === "copied"
      ? `已复制 ${copyTargetLabel(lastCopyTarget)}`
      : copyStatus[lastCopyTarget] === "error"
        ? `${copyTargetLabel(lastCopyTarget)} 复制失败`
        : "打开复制菜单";

  return (
    <div
      ref={popoverRef}
      className="event-popover"
      id="event-popover"
      style={{
        top: `${position.top}px`,
        right: `${position.right}px`,
        width: `min(420px, calc(100vw - 16px))`,
      }}
    >
      <div className="event-popover-head">
        <div className="event-popover-head-main">
          <strong>{`#${seq} ${event.type}`}</strong>
          <span className="event-popover-meta">
            {showSwitcher && activeRelatedIndex >= 0
              ? `${groupSummary} · ${activeRelatedIndex + 1}/${relatedEvents.length}`
              : groupSummary}
          </span>
          <span className="event-popover-meta">{`时间: ${readableTimestamp}`}</span>
        </div>
        <div className="event-popover-actions">
          {showCollect && (
            <UiButton
              className="event-popover-action-btn"
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="收集事件快照"
              title="收集事件快照"
              onClick={() => {
                const payload = buildCollectedSnapshot(event, collectibleRelatedEvents);
                const rawJsonStr = stringifyPopoverPayload(payload);
                setPopoverState({
                  payload,
                  rawJsonStr,
                  displayJsonStr: rawJsonStr,
                });
              }}
            >
              <MaterialIcon name="inventory_2" />
            </UiButton>
          )}
          <Popover
            open={copyMenuOpen}
            trigger="click"
            placement="bottomRight"
            arrow={false}
            classNames={{
              root: "event-popover-copy-menu-overlay",
            }}
            onOpenChange={setCopyMenuOpen}
            content={
              <div className="event-popover-copy-menu" role="menu" aria-label="复制菜单">
                {copyMenuItems.map((item) => (
                  <UiButton
                    key={item.target}
                    variant="ghost"
                    size="sm"
                    className="event-popover-copy-menu-item"
                    aria-label={item.label}
                    title={item.label}
                    onClick={() => {
                      setCopyMenuOpen(false);
                      handleCopy(item.target, item.text);
                    }}
                  >
                    {item.label}
                  </UiButton>
                ))}
              </div>
            }
          >
            <UiButton
              className="event-popover-action-btn"
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="打开复制菜单"
              aria-haspopup="menu"
              aria-expanded={copyMenuOpen}
              title={copyMenuTitle}
            >
              <MaterialIcon name={copyIcon} />
            </UiButton>
          </Popover>
          <UiButton
            className="event-popover-action-btn event-popover-close"
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="关闭事件详情"
            title="关闭事件详情"
            onClick={() =>
              dispatch({
                type: "SET_EVENT_POPOVER",
                index: -1,
                event: null,
                anchor: null,
              })
            }
          >
            <MaterialIcon name="close" />
          </UiButton>
        </div>
      </div>
      <pre className="event-popover-body">{popoverState.displayJsonStr}</pre>
    </div>
  );
};

export const __TEST_ONLY__ = {
  canCollectEvent,
  copyText,
  formatReadableTimestamp,
  getCollectibleRelatedEvents,
  buildCollectedSnapshot,
  mapCollectedSnapshotType,
  resolveEventGroupMeta,
  resolveDebugPreCallCopyPayloads,
  buildEventCopyMenuItems,
  resolveInitialPopoverState,
  stringifyPopoverPayload,
};
