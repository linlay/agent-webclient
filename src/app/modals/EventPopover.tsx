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
type CopyFeedbackState = "idle" | "copied" | "error";

interface DebugPreCallCopyPayloads {
  requestBodyText: string;
  systemPromptText: string;
  toolsText: string;
  modelText: string;
}

interface EventCopyMenuItem {
  key: string;
  label: string;
  text: string;
}

interface CopyMenuItemState {
  key: string;
  label: string;
}

const DEFAULT_COPY_MENU_ITEM: CopyMenuItemState = {
  key: "eventJson",
  label: "全部",
};

function readEventIdValue(
  event: Partial<Record<EventGroupIdKey, unknown>> | null | undefined,
  idKey: EventGroupIdKey,
): string {
  const value = event?.[idKey];
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

function readNonEmptyStringValue(value: unknown): string {
  const text = readStringValue(value);
  return text.trim() ? text : "";
}

function stringifyCopyValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim() ? value : "";
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function pushCopyMenuItem(
  items: EventCopyMenuItem[],
  key: string,
  label: string,
  text: string,
): void {
  if (!text) {
    return;
  }
  items.push({ key, label, text });
}

function pushDefaultCopyMenuItem(
  items: EventCopyMenuItem[],
  rawJsonStr: string,
): void {
  pushCopyMenuItem(items, "eventJson", "复制全部", rawJsonStr);
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
    modelText: stringifyCopyValue(requestBody.model),
  };
}

function readCurrentTextForCopy(event: AgentEvent | null): string {
  if (!event) {
    return "";
  }
  return readStringValue(event.text) || readStringValue(event.delta);
}

function buildCollectedSnapshotJson(
  event: AgentEvent | null,
  collectibleRelatedEvents: RelatedEventEntry[],
): string {
  if (!event || collectibleRelatedEvents.length === 0) {
    return "";
  }
  return stringifyPopoverPayload(
    buildCollectedSnapshot(event, collectibleRelatedEvents),
  );
}

function readCollectedSnapshotText(
  event: AgentEvent | null,
  collectibleRelatedEvents: RelatedEventEntry[],
): string {
  if (!event || collectibleRelatedEvents.length === 0) {
    return "";
  }
  const snapshot = buildCollectedSnapshot(event, collectibleRelatedEvents);
  return readStringValue(snapshot.text);
}

function readObjectLikeCopyValue(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function readBufferedDeltaText(
  relatedEvents: RelatedEventEntry[],
  eventTypePrefix: string,
  deltaEventType: string,
): string {
  return relatedEvents
    .filter((entry) => {
      const type = String(entry.event.type || "").toLowerCase();
      return type.startsWith(eventTypePrefix) && type === deltaEventType;
    })
    .map((entry) => readStringValue(entry.event.delta))
    .join("");
}

function readToolArgumentsForCopy(
  event: AgentEvent | null,
  relatedEvents: RelatedEventEntry[],
): string {
  if (!event) {
    return "";
  }
  return (
    readObjectLikeCopyValue(event.toolParams) ||
    readObjectLikeCopyValue(event.arguments) ||
    readNonEmptyStringValue(event.arguments) ||
    readBufferedDeltaText(relatedEvents, "tool.", "tool.args")
  );
}

function readActionArgumentsForCopy(
  event: AgentEvent | null,
  relatedEvents: RelatedEventEntry[],
): string {
  if (!event) {
    return "";
  }
  return (
    readObjectLikeCopyValue(event.arguments) ||
    readNonEmptyStringValue(event.arguments) ||
    readObjectLikeCopyValue(event.actionParams) ||
    readBufferedDeltaText(relatedEvents, "action.", "action.args")
  );
}

function readResultForCopy(relatedEvents: RelatedEventEntry[]): string {
  for (let index = relatedEvents.length - 1; index >= 0; index -= 1) {
    const candidate = relatedEvents[index]?.event;
    if (!candidate) {
      continue;
    }
    const text =
      stringifyCopyValue(candidate.result) ||
      stringifyCopyValue(candidate.output) ||
      readNonEmptyStringValue(candidate.text);
    if (text) {
      return text;
    }
  }
  return "";
}

function readArtifactUrlsForCopy(event: AgentEvent | null): string {
  if (!event || !Array.isArray(event.artifacts)) {
    return "";
  }
  return event.artifacts
    .map((artifact) => {
      const record = readObjectValue(artifact);
      return record ? readNonEmptyStringValue(record.url) : "";
    })
    .filter(Boolean)
    .join("\n");
}

function readAwaitingItemsForCopy(event: AgentEvent | null): string {
  if (!event) {
    return "";
  }
  const record = event as Record<string, unknown>;
  return (
    stringifyCopyValue(record.questions) ||
    stringifyCopyValue(record.approvals) ||
    stringifyCopyValue(record.forms) ||
    stringifyCopyValue(record.answers)
  );
}

function buildCopyMenuTitle(
  lastCopyItem: CopyMenuItemState,
  copyStatus: Record<string, CopyFeedbackState>,
): string {
  const status = copyStatus[lastCopyItem.key] || "idle";
  if (status === "copied") {
    return `已复制 ${lastCopyItem.label}`;
  }
  if (status === "error") {
    return `${lastCopyItem.label} 复制失败`;
  }
  return "打开复制菜单";
}

function getPrimaryCopyMenuItem(
  items: EventCopyMenuItem[],
): EventCopyMenuItem | null {
  return items[0] || null;
}

function buildEventCopyMenuItems(
  event: AgentEvent | null,
  relatedEvents: RelatedEventEntry[],
  rawJsonStr: string,
): EventCopyMenuItem[] {
  const items: EventCopyMenuItem[] = [];
  pushDefaultCopyMenuItem(items, rawJsonStr);
  const type = String(event?.type || "").toLowerCase();
  const collectibleRelatedEvents = getCollectibleRelatedEvents(
    event,
    resolveEventGroupMeta(event),
    relatedEvents,
  );
  const collectedSnapshotJson = buildCollectedSnapshotJson(
    event,
    collectibleRelatedEvents,
  );
  const collectedText = readCollectedSnapshotText(event, collectibleRelatedEvents);

  if (type === "debug.precall") {
    const debugPreCallPayloads = resolveDebugPreCallCopyPayloads(event);
    if (debugPreCallPayloads) {
      pushCopyMenuItem(items, "requestBody", "复制 requestBody", debugPreCallPayloads.requestBodyText);
      pushCopyMenuItem(items, "systemPrompt", "复制 systemPrompt", debugPreCallPayloads.systemPromptText);
      pushCopyMenuItem(items, "tools", "复制 tools", debugPreCallPayloads.toolsText);
      pushCopyMenuItem(items, "model", "复制 model", debugPreCallPayloads.modelText);
    }
    return items;
  }

  if (type.startsWith("chat.")) {
    pushCopyMenuItem(items, "chatId", "复制 chatId", readEventIdValue(event || {}, "chatId"));
    pushCopyMenuItem(items, "chatName", "复制 chatName", readNonEmptyStringValue(event?.chatName));
    return items;
  }

  if (type === "request.query" || type === "request.steer") {
    pushCopyMenuItem(items, "requestId", "复制 requestId", readEventIdValue(event || {}, "requestId"));
    pushCopyMenuItem(items, "message", "复制消息", readNonEmptyStringValue(event?.message));
    pushCopyMenuItem(items, "references", "复制 references", stringifyCopyValue(event?.references));
    return items;
  }

  if (type.startsWith("run.")) {
    pushCopyMenuItem(items, "runId", "复制 runId", readEventIdValue(event || {}, "runId"));
    pushCopyMenuItem(items, "chatId", "复制 chatId", readEventIdValue(event || {}, "chatId"));
    pushCopyMenuItem(items, "requestId", "复制 requestId", readEventIdValue(event || {}, "requestId"));
    if (type === "run.error") {
      pushCopyMenuItem(items, "error", "复制错误信息", stringifyCopyValue(event?.error));
    }
    return items;
  }

  if (type.startsWith("content.")) {
    pushCopyMenuItem(items, "contentId", "复制 contentId", readEventIdValue(event || {}, "contentId"));
    pushCopyMenuItem(items, "currentText", "复制当前文本", readCurrentTextForCopy(event));
    pushCopyMenuItem(items, "collectedText", "复制汇总文本", collectedText);
    pushCopyMenuItem(items, "collectedSnapshot", "复制汇总快照 JSON", collectedSnapshotJson);
    return items;
  }

  if (type.startsWith("reasoning.")) {
    pushCopyMenuItem(items, "reasoningId", "复制 reasoningId", readEventIdValue(event || {}, "reasoningId"));
    pushCopyMenuItem(items, "currentText", "复制当前文本", readCurrentTextForCopy(event));
    pushCopyMenuItem(items, "collectedText", "复制汇总文本", collectedText);
    pushCopyMenuItem(items, "collectedSnapshot", "复制汇总快照 JSON", collectedSnapshotJson);
    return items;
  }

  if (type.startsWith("tool.")) {
    pushCopyMenuItem(items, "toolId", "复制 toolId", readEventIdValue(event || {}, "toolId"));
    pushCopyMenuItem(
      items,
      "toolName",
      "复制 toolName",
      readNonEmptyStringValue(event?.toolLabel) || readNonEmptyStringValue(event?.toolName),
    );
    pushCopyMenuItem(items, "arguments", "复制参数", readToolArgumentsForCopy(event, relatedEvents));
    pushCopyMenuItem(items, "result", "复制结果", readResultForCopy(relatedEvents));
    pushCopyMenuItem(items, "collectedSnapshot", "复制汇总快照 JSON", collectedSnapshotJson);
    return items;
  }

  if (type.startsWith("action.")) {
    pushCopyMenuItem(items, "actionId", "复制 actionId", readEventIdValue(event || {}, "actionId"));
    pushCopyMenuItem(items, "actionName", "复制 actionName", readNonEmptyStringValue(event?.actionName));
    pushCopyMenuItem(items, "arguments", "复制参数", readActionArgumentsForCopy(event, relatedEvents));
    pushCopyMenuItem(items, "result", "复制结果", readResultForCopy(relatedEvents));
    pushCopyMenuItem(items, "collectedSnapshot", "复制汇总快照 JSON", collectedSnapshotJson);
    return items;
  }

  if (type.startsWith("plan.")) {
    pushCopyMenuItem(items, "planId", "复制 planId", readEventIdValue(event || {}, "planId"));
    pushCopyMenuItem(items, "planJson", "复制 plan JSON", stringifyCopyValue(event?.plan));
    return items;
  }

  if (type.startsWith("task.")) {
    const groupId =
      readNonEmptyStringValue((event as Record<string, unknown> | null)?.taskGroupId) ||
      readNonEmptyStringValue((event as Record<string, unknown> | null)?.groupId);
    pushCopyMenuItem(items, "taskId", "复制 taskId", readEventIdValue(event || {}, "taskId"));
    pushCopyMenuItem(items, "taskName", "复制 taskName", readNonEmptyStringValue(event?.taskName));
    pushCopyMenuItem(items, "taskGroupId", "复制 taskGroupId", groupId);
    if (type === "task.fail") {
      pushCopyMenuItem(items, "error", "复制错误信息", stringifyCopyValue(event?.error));
    }
    return items;
  }

  if (type === "artifact.publish") {
    pushCopyMenuItem(items, "runId", "复制 runId", readEventIdValue(event || {}, "runId"));
    pushCopyMenuItem(items, "artifacts", "复制 artifacts JSON", stringifyCopyValue(event?.artifacts));
    pushCopyMenuItem(items, "artifactUrls", "复制 artifact URLs", readArtifactUrlsForCopy(event));
    return items;
  }

  if (type.startsWith("awaiting.")) {
    pushCopyMenuItem(items, "awaitingId", "复制 awaitingId", readEventIdValue(event || {}, "awaitingId"));
    pushCopyMenuItem(items, "awaitingItems", "复制问题/审批/表单 JSON", readAwaitingItemsForCopy(event));
    return items;
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
  const copyTimerRef = useRef<Map<string, number>>(new Map());
  const [popoverState, setPopoverState] = useState(() =>
    resolveInitialPopoverState(state.eventPopoverEventRef),
  );
  const [copyStatus, setCopyStatus] = useState<Record<string, CopyFeedbackState>>({});
  const [lastCopyItem, setLastCopyItem] = useState<CopyMenuItemState>(
    DEFAULT_COPY_MENU_ITEM,
  );
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
    () => buildEventCopyMenuItems(event, relatedEvents, popoverState.rawJsonStr),
    [event, relatedEvents, popoverState.rawJsonStr],
  );
  const primaryCopyMenuItem = useMemo(
    () => getPrimaryCopyMenuItem(copyMenuItems),
    [copyMenuItems],
  );
  useEffect(() => {
    setPopoverState(resolveInitialPopoverState(event));
    copyTimerRef.current.forEach((timer) => window.clearTimeout(timer));
    copyTimerRef.current.clear();
    setCopyStatus({});
    setLastCopyItem(DEFAULT_COPY_MENU_ITEM);
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
    copyStatus[lastCopyItem.key] === "copied" ? "check" : "content_copy";
  const readableTimestamp = formatReadableTimestamp(
    resolveDisplayPayloadTimestamp(popoverState.payload),
  );

  const handleCopy = (item: EventCopyMenuItem) => {
    const { key, label, text } = item;
    if (!text) {
      return;
    }
    setLastCopyItem({ key, label: label.replace(/^复制\s*/, "") });
    void copyText(text)
      .then(() => {
        const existing = copyTimerRef.current.get(key);
        if (existing) {
          window.clearTimeout(existing);
        }
        setCopyStatus((current) => ({ ...current, [key]: "copied" }));
        const timer = window.setTimeout(() => {
          setCopyStatus((current) => ({ ...current, [key]: "idle" }));
          copyTimerRef.current.delete(key);
        }, 1600);
        copyTimerRef.current.set(key, timer);
      })
      .catch(() => {
        const existing = copyTimerRef.current.get(key);
        if (existing) {
          window.clearTimeout(existing);
        }
        setCopyStatus((current) => ({ ...current, [key]: "error" }));
        const timer = window.setTimeout(() => {
          setCopyStatus((current) => ({ ...current, [key]: "idle" }));
          copyTimerRef.current.delete(key);
        }, 1600);
        copyTimerRef.current.set(key, timer);
      });
  };

  const copyMenuTitle = buildCopyMenuTitle(lastCopyItem, copyStatus);

  return (
    <div
      ref={popoverRef}
      className="event-popover"
      id="event-popover"
      onDoubleClick={() => {
        if (primaryCopyMenuItem) {
          handleCopy(primaryCopyMenuItem);
        }
      }}
      title="双击复制全部"
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
                    key={item.key}
                    variant="ghost"
                    size="sm"
                    className="event-popover-copy-menu-item"
                    aria-label={item.label}
                    title={item.label}
                    onClick={() => {
                      setCopyMenuOpen(false);
                      handleCopy(item);
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
  buildCopyMenuTitle,
  getPrimaryCopyMenuItem,
  resolveInitialPopoverState,
  stringifyPopoverPayload,
};
