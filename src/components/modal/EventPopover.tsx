import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import type { AgentEvent } from "../../context/types";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";

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
  { prefix: "artifact.", idKey: "artifactId", family: "artifact" },
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

export const EventPopover: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [jsonStr, setJsonStr] = useState("");
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
  useEffect(() => {
    setJsonStr(event ? JSON.stringify(event, null, 2) : "");
  }, [event]);

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
  }, [isOpen, jsonStr, state.eventPopoverAnchor, switcherSignature]);

  if (!isOpen || !event) {
    return null;
  }

  const seq = event.seq ?? "-";
  const groupSummary = groupMeta
    ? `${groupMeta.idKey}: ${groupMeta.idValue}`
    : "未识别分组";
  const showSwitcher = relatedEvents.length > 1;

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
        </div>
        {showSwitcher && (
          <UiButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setJsonStr(
                JSON.stringify(
                  relatedEvents.reduce((pre, cur: any) => {
                    const curEvent = cur.event;
                    return Object.assign(pre, curEvent, {
                      text: (pre.text || '') + (curEvent?.delta || ''),
                      arguments: (pre.arguments || '') + (curEvent.delta || ''),
                    });
                  }, {} as any),
                  null,
                  2,
                ),
              );
            }}
          >
            收集
          </UiButton>
        )}
        <UiButton
          className="event-popover-close"
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="关闭事件详情"
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
      <pre className="event-popover-body">{jsonStr}</pre>
    </div>
  );
};
