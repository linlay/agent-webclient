import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  const copyTimerRef = useRef<number | null>(null);
  const [popoverState, setPopoverState] = useState(() =>
    resolveInitialPopoverState(state.eventPopoverEventRef),
  );
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
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
  useEffect(() => {
    setPopoverState(resolveInitialPopoverState(event));
    setCopyStatus("idle");
  }, [event]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
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
  const copyIcon = copyStatus === "copied" ? "check" : "content_copy";
  const readableTimestamp = formatReadableTimestamp(
    resolveDisplayPayloadTimestamp(popoverState.payload),
  );

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
          <UiButton
            className="event-popover-action-btn"
            variant="ghost"
            size="sm"
            iconOnly
            disabled={!popoverState.rawJsonStr}
            aria-label="复制事件 JSON"
            title={
              copyStatus === "copied"
                ? "已复制"
                : copyStatus === "error"
                  ? "复制失败"
                  : "复制事件 JSON"
            }
            onClick={() => {
              if (!popoverState.rawJsonStr) {
                return;
              }
              void copyText(popoverState.rawJsonStr)
                .then(() => {
                  if (copyTimerRef.current) {
                    window.clearTimeout(copyTimerRef.current);
                  }
                  setCopyStatus("copied");
                  copyTimerRef.current = window.setTimeout(() => {
                    setCopyStatus("idle");
                    copyTimerRef.current = null;
                  }, 1600);
                })
                .catch(() => {
                  if (copyTimerRef.current) {
                    window.clearTimeout(copyTimerRef.current);
                  }
                  setCopyStatus("error");
                  copyTimerRef.current = window.setTimeout(() => {
                    setCopyStatus("idle");
                    copyTimerRef.current = null;
                  }, 1600);
                });
            }}
          >
            <MaterialIcon name={copyIcon} />
          </UiButton>
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
  resolveInitialPopoverState,
  stringifyPopoverPayload,
};
