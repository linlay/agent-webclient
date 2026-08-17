import React from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { AgentEvent } from "@/app/state/types";
import { formatDebugTimestamp } from "@/shared/utils/debugTime";
import {
  classifyEventGroup,
  type DebugEventGroup,
  getEventId,
  isErrorEventType,
  shouldDisplayDebugEvent,
} from "@/features/events/lib/debugEventDisplay";
import { t } from "@/shared/i18n";
import { buildConversationSharePath } from "@/shared/data/conversationShare";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { Flex, Modal, Tabs, Tag, Tooltip, Typography } from "antd";
import { buildSurfaceRoute, readSurfacePresentationContext } from "@/features/surfaces/surfaceRoutes";

function formatDebugTime(timestamp?: number): string {
  return formatDebugTimestamp(timestamp);
}

const DEBUG_PANEL_CLASS_NAME =
  "debug-panel tw:flex tw:h-full tw:flex-col tw:overflow-hidden";

const DEBUG_EVENT_LIST_CLASS_NAME = [
  "list",
  "tw:flex-1 tw:overflow-y-auto tw:p-2",
  SCROLLBAR_THIN_CLASS_NAME,
].join(" ");

const DEBUG_EVENTS_TAB_CLASS_NAME =
  "debug-events-tab tw:h-full tw:overflow-y-auto tw:pb-2";

const EVENT_ROW_BASE_CLASS_NAME =
  "event-row tw:relative tw:mt-1.5 tw:cursor-pointer tw:rounded-[10px] tw:border tw:py-2 tw:pl-3 tw:pr-2.5 tw:text-xs tw:transition-[border-color,background,transform] tw:duration-[160ms] tw:ease-in-out tw:[border-color:color-mix(in_srgb,var(--line-soft)_88%,transparent)] tw:hover:border-inherit tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--line-soft)_100%,transparent)] tw:[html[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--bg-elev-1)_92%,var(--bg-elev-2))]";

const EVENT_ROW_ERROR_CLASS_NAME =
  "is-error-type tw:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-danger)_38%,transparent)]";

const EVENT_ROW_TIME_CLASS_NAME =
  "event-row-time tw:whitespace-nowrap tw:font-code tw:text-[10px] tw:leading-[1.35] tw:text-ink-muted tw:opacity-90";

const EVENT_ROW_ACTIONS_CLASS_NAME =
  "event-row-actions tw:mt-1.5 tw:flex tw:flex-wrap tw:items-center tw:gap-1";

const EVENT_ROW_ROUTE_BUTTON_CLASS_NAME =
  "debug-chat-route-btn tw:h-6 tw:min-h-6 tw:px-1.5 tw:py-0 tw:text-[11px] tw:font-semibold tw:[&_.material-icon]:text-[13px]";

const EVENT_ROW_GROUP_CLASS_NAMES: Record<
  Exclude<DebugEventGroup, "">,
  string
> = {
  request:
    "tw:text-[#5a86c8] tw:bg-[color-mix(in_srgb,#5a86c8_8%,var(--bg-elev-2))]",
  chat: "tw:text-[#6b92bf] tw:bg-[color-mix(in_srgb,#6b92bf_8%,var(--bg-elev-2))]",
  run: "tw:text-[#4476ad] tw:bg-[color-mix(in_srgb,#4476ad_8%,var(--bg-elev-2))]",
  debug:
    "tw:text-[#7c8aa5] tw:bg-[color-mix(in_srgb,#7c8aa5_8%,var(--bg-elev-2))]",
  awaiting:
    "tw:text-[#d2b395] tw:bg-[color-mix(in_srgb,#d2b395_8%,var(--bg-elev-2))]",
  memory: "",
  content:
    "tw:text-[#5aa79d] tw:bg-[color-mix(in_srgb,#5aa79d_8%,var(--bg-elev-2))]",
  reasoning:
    "tw:text-[#7ab9a8] tw:bg-[color-mix(in_srgb,#7ab9a8_7%,var(--bg-elev-2))]",
  planning: "",
  tool: "tw:text-[#d6a05e] tw:bg-[color-mix(in_srgb,#d6a05e_7%,var(--bg-elev-2))]",
  action:
    "tw:text-[#ca9168] tw:bg-[color-mix(in_srgb,#ca9168_8%,var(--bg-elev-2))]",
  plan: "tw:text-[#8e82c4] tw:bg-[color-mix(in_srgb,#8e82c4_8%,var(--bg-elev-2))]",
  task: "tw:text-[#a094d0] tw:bg-[color-mix(in_srgb,#a094d0_8%,var(--bg-elev-2))]",
  artifact:
    "tw:text-[#d98a42] tw:bg-[color-mix(in_srgb,#d98a42_8%,var(--bg-elev-2))]",
  source:
    "tw:text-[#4f9fc7] tw:bg-[color-mix(in_srgb,#4f9fc7_8%,var(--bg-elev-2))]",
};

const EVENT_ROW_UNRECOGNIZED_CLASS_NAME =
  "tw:text-[color-mix(in_srgb,var(--ink-muted)_88%,var(--ink-2))] tw:bg-[color-mix(in_srgb,var(--ink-muted)_5%,var(--bg-elev-2))]";

function resolveEventRowClassName(eventType: string, isError: boolean): string {
  const group = classifyEventGroup(eventType);
  return [
    EVENT_ROW_BASE_CLASS_NAME,
    group
      ? EVENT_ROW_GROUP_CLASS_NAMES[group]
      : EVENT_ROW_UNRECOGNIZED_CLASS_NAME,
    isError ? EVENT_ROW_ERROR_CLASS_NAME : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export const DEBUG_EVENT_TABS: Array<{
  key: "all" | Exclude<DebugEventGroup, "">;
  labelKey: string;
  color: string;
}> = [
  { key: "all", labelKey: "rightSidebar.debug.tabs.all", color: "blue" },
  {
    key: "request",
    labelKey: "rightSidebar.debug.tabs.request",
    color: "#5A86C8",
  },
  { key: "chat", labelKey: "rightSidebar.debug.tabs.chat", color: "#6B92BF" },
  { key: "run", labelKey: "rightSidebar.debug.tabs.run", color: "#4476AD" },
  { key: "debug", labelKey: "rightSidebar.debug.tabs.debug", color: "#7C8AA5" },
  {
    key: "awaiting",
    labelKey: "rightSidebar.debug.tabs.awaiting",
    color: "#D2B395",
  },
  {
    key: "memory",
    labelKey: "rightSidebar.debug.tabs.memory",
    color: "#7091B6",
  },
  {
    key: "reasoning",
    labelKey: "rightSidebar.debug.tabs.reasoning",
    color: "#7AB9A8",
  },
  {
    key: "planning",
    labelKey: "rightSidebar.debug.tabs.planning",
    color: "#8B9AD8",
  },
  {
    key: "content",
    labelKey: "rightSidebar.debug.tabs.content",
    color: "#5AA79D",
  },
  { key: "tool", labelKey: "rightSidebar.debug.tabs.tool", color: "#D6A05E" },
  {
    key: "action",
    labelKey: "rightSidebar.debug.tabs.action",
    color: "#CA9168",
  },
  { key: "plan", labelKey: "rightSidebar.debug.tabs.plan", color: "#8E82C4" },
  { key: "task", labelKey: "rightSidebar.debug.tabs.task", color: "#A094D0" },
  {
    key: "artifact",
    labelKey: "rightSidebar.debug.tabs.artifact",
    color: "#D98A42",
  },
  {
    key: "source",
    labelKey: "rightSidebar.debug.tabs.source",
    color: "#4F9FC7",
  },
];

export type DebugTabKey = (typeof DEBUG_EVENT_TABS)[number]["key"];
type DebugChatRouteKind =
  | "agent"
  | "copilot"
  | "overview"
  | "debug"
  | "terminal"
  | "share";

export interface DebugChatRouteTarget {
  kind: DebugChatRouteKind;
  href: string;
  labelKey: string;
  titleKey: string;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readCurrentSearch(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.search || "";
}

export function buildDebugChatRouteUrl(
  kind: DebugChatRouteKind,
  input: {
    agentKey?: unknown;
    chatId?: unknown;
    runId?: unknown;
    terminalKey?: unknown;
    shareId?: unknown;
  },
  currentSearch = "",
): string {
  const agentKey = readText(input.agentKey);
  const chatId = readText(input.chatId);
  const presentation = readSurfacePresentationContext(currentSearch);
  const params = new URLSearchParams();
  if (presentation.lang) params.set("lang", presentation.lang);
  if (presentation.theme) params.set("theme", presentation.theme);

  if (kind === "share") {
    return buildConversationSharePath(input.shareId);
  }

  if (kind === "agent" || kind === "copilot") {
    if (!agentKey || !chatId) return "";
    params.set("chatId", chatId);
    return `/${kind}/${encodeURIComponent(agentKey)}?${params.toString()}`;
  }
  if (kind === "terminal") {
    return buildSurfaceRoute({
      kind: "terminal",
      agentKey,
      terminalKey: readText(input.terminalKey) || "main",
    }, presentation);
  }
  if (kind !== "overview" && kind !== "debug") return "";
  return buildSurfaceRoute({ kind, agentKey, chatId }, presentation);
}

export function buildDebugChatStartOpenTargets(
  event: AgentEvent,
  currentSearch = readCurrentSearch(),
  fallbackAgentKey = "",
  fallbackShareId = "",
): DebugChatRouteTarget[] {
  if (String(event.type || "") !== "chat.start") {
    return [];
  }

  const chatId = readText(event.chatId);
  const agentKey =
    readText(event.agentKey) ||
    readText(event.firstAgentKey) ||
    readText(fallbackAgentKey);
  const shareId =
    readText((event as Record<string, unknown>).shareId) ||
    readText(fallbackShareId);
  if (!chatId || !agentKey) {
    return [];
  }

  const targets: DebugChatRouteTarget[] = [
    {
      kind: "agent",
      href: buildDebugChatRouteUrl(
        "agent",
        { agentKey, chatId },
        currentSearch,
      ),
      labelKey: "rightSidebar.debug.openChat.agent",
      titleKey: "rightSidebar.debug.openChat.agentTitle",
    },
    {
      kind: "copilot",
      href: buildDebugChatRouteUrl(
        "copilot",
        { agentKey, chatId },
        currentSearch,
      ),
      labelKey: "rightSidebar.debug.openChat.copilot",
      titleKey: "rightSidebar.debug.openChat.copilotTitle",
    },
    {
      kind: "overview",
      href: buildDebugChatRouteUrl(
        "overview",
        { agentKey, chatId, runId: event.runId },
        currentSearch,
      ),
      labelKey: "copilot.panel.overview",
      titleKey: "copilot.panel.overview",
    },
    {
      kind: "debug",
      href: buildDebugChatRouteUrl(
        "debug",
        { agentKey, chatId, runId: event.runId },
        currentSearch,
      ),
      labelKey: "copilot.panel.debug",
      titleKey: "copilot.panel.debug",
    },
    {
      kind: "terminal",
      href: buildDebugChatRouteUrl(
        "terminal",
        { agentKey, terminalKey: "main" },
        currentSearch,
      ),
      labelKey: "terminal.panelAria",
      titleKey: "terminal.panelAria",
    },
  ];
  const shareHref = buildDebugChatRouteUrl("share", { shareId });
  if (shareHref) {
    targets.push({
      kind: "share",
      href: shareHref,
      labelKey: "share.label",
      titleKey: "share.label",
    });
  }
  return targets;
}

function openDebugChatRoute(href: string): void {
  if (
    !href ||
    typeof window === "undefined" ||
    typeof window.open !== "function"
  ) {
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

export function buildDebugEventGroups(
  events: AgentEvent[],
): Map<DebugTabKey, Array<{ event: AgentEvent; index: number }>> {
  const grouped = new Map<
    DebugTabKey,
    Array<{ event: AgentEvent; index: number }>
  >();

  DEBUG_EVENT_TABS.forEach((tab) => grouped.set(tab.key, []));

  events.forEach((event, index) => {
    if (!shouldDisplayDebugEvent(event)) {
      return;
    }
    grouped.get("all")?.push({ event, index });
    const group = classifyEventGroup(String(event.type || ""));
    if (group) {
      grouped.get(group)?.push({ event, index });
    }
  });

  return grouped;
}

const EventRow: React.FC<{
  event: AgentEvent;
  index: number;
  fallbackAgentKey?: string;
  fallbackShareId?: string;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = ({
  event,
  index,
  fallbackAgentKey = "",
  fallbackShareId = "",
  onClick,
}) => {
  const type = String(event.type || "");
  const ts = formatDebugTime(event.timestamp);
  const hasError = isErrorEventType(type);
  const id = getEventId(event);
  const chatRouteTargets = buildDebugChatStartOpenTargets(
    event,
    readCurrentSearch(),
    fallbackAgentKey,
    fallbackShareId,
  );
  const handleRouteClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, href: string) => {
      e.stopPropagation();
      openDebugChatRoute(href);
    },
    [],
  );

  return (
    <Flex
      className={resolveEventRowClassName(type, hasError)}
      data-event-index={index}
      align="center"
      onClick={onClick}
    >
      <Flex vertical className="tw:flex-1 tw:overflow-hidden">
        <Flex justify="space-between">
          <strong>{type}</strong>
          <Tooltip
            title={
              event.timestamp && new Date(event.timestamp).toLocaleString()
            }
          >
            <span className={EVENT_ROW_TIME_CLASS_NAME}>{ts}</span>
          </Tooltip>
        </Flex>
        <Typography.Text
          className={EVENT_ROW_TIME_CLASS_NAME}
          ellipsis={{ tooltip: id }}
        >
          {id}
        </Typography.Text>
        {chatRouteTargets.length > 0 ? (
          <div className={EVENT_ROW_ACTIONS_CLASS_NAME}>
            {chatRouteTargets.map((target) => {
              const label = t(target.labelKey);
              const title = t(target.titleKey);
              return (
                <UiButton
                  key={target.kind}
                  className={EVENT_ROW_ROUTE_BUTTON_CLASS_NAME}
                  size="sm"
                  variant="ghost"
                  aria-label={title}
                  title={title}
                  onClick={(e) => handleRouteClick(e, target.href)}
                >
                  <MaterialIcon name="open_in_new" />
                  {label}
                </UiButton>
              );
            })}
          </div>
        ) : null}
      </Flex>
    </Flex>
  );
};

export const DebugPanelContent: React.FC<{
  independentDetails?: boolean;
}> = ({ independentDetails = false }) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [selectedEvent, setSelectedEvent] = React.useState<AgentEvent | null>(null);

  const openEventPopover = React.useCallback(
    (event: AgentEvent, idx: number, target: HTMLDivElement) => {
      if (independentDetails) {
        setSelectedEvent(event);
        return;
      }
      const rect = target.getBoundingClientRect();
      dispatch({
        type: "SET_EVENT_POPOVER",
        index: idx,
        event,
        anchor: {
          x: rect.left,
          y: rect.bottom,
        },
      });
    },
    [dispatch, independentDetails],
  );

  const eventsByTab = React.useMemo(
    () => buildDebugEventGroups(state.debugEvents),
    [state.debugEvents],
  );
  const chatAgentKeyById = React.useMemo(() => {
    const next = new Map<string, string>();
    state.chatAgentById.forEach((agentKey, chatId) => {
      const normalizedChatId = readText(chatId);
      const normalizedAgentKey = readText(agentKey);
      if (normalizedChatId && normalizedAgentKey) {
        next.set(normalizedChatId, normalizedAgentKey);
      }
    });
    state.chats.forEach((chat) => {
      const chatId = readText(chat?.chatId);
      const agentKey =
        readText(chat?.agentKey) || readText(chat?.firstAgentKey);
      if (chatId && agentKey && !next.has(chatId)) {
        next.set(chatId, agentKey);
      }
    });
    const activeChatId = readText(state.chatId);
    const activeAgentKey =
      readText(state.currentRunAgentKey) ||
      readText(state.pendingNewChatAgentKey);
    if (activeChatId && activeAgentKey && !next.has(activeChatId)) {
      next.set(activeChatId, activeAgentKey);
    }
    return next;
  }, [
    state.chatAgentById,
    state.chatId,
    state.chats,
    state.currentRunAgentKey,
    state.pendingNewChatAgentKey,
  ]);
  const chatShareIdById = React.useMemo(() => {
    const next = new Map<string, string>();
    state.chats.forEach((chat) => {
      const chatId = readText(chat?.chatId);
      const shareId = readText(chat?.shareId);
      if (chatId && buildConversationSharePath(shareId)) {
        next.set(chatId, shareId);
      }
    });
    return next;
  }, [state.chats]);

  const tabItems = React.useMemo(
    () =>
      DEBUG_EVENT_TABS.flatMap((tab) => {
        const entries = eventsByTab.get(tab.key) || [];
        if (tab.key !== "all" && entries.length === 0) {
          return [];
        }
        return [
          {
            key: tab.key,
            label: t("rightSidebar.debug.tabs.labelWithCount", {
              label: t(tab.labelKey),
              count: entries.length,
            }),
            color: tab.color,
            children: (
              <div className={DEBUG_EVENTS_TAB_CLASS_NAME}>
                {entries.map(({ event, index }) => (
                  <EventRow
                    key={`${index}-${String(event.type || "")}`}
                    event={event}
                    index={index}
                    fallbackAgentKey={chatAgentKeyById.get(
                      readText(event.chatId),
                    )}
                    fallbackShareId={chatShareIdById.get(
                      readText(event.chatId),
                    )}
                    onClick={(e) =>
                      openEventPopover(event, index, e.currentTarget)
                    }
                  />
                ))}
              </div>
            ),
          },
        ];
      }),
    [
      chatAgentKeyById,
      chatShareIdById,
      eventsByTab,
      openEventPopover,
    ],
  );

  return (
    <div className={DEBUG_PANEL_CLASS_NAME}>
      <div className={DEBUG_EVENT_LIST_CLASS_NAME} id="events-list">
        {state.debugEvents.length === 0 ? (
          <div className="status-line">{t("rightSidebar.debug.empty")}</div>
        ) : (
          <Tabs
            size="small"
            renderTabBar={(props) => {
              return (
                <Flex wrap gap={6}>
                  {tabItems.map((item) => (
                    <Tag
                      key={item.key}
                      style={{ cursor: "pointer", borderRadius: 12 }}
                      color={
                        props.activeKey === item.key ? item.color : undefined
                      }
                      onClick={(e) => props.onTabClick(item.key, e)}
                    >
                      {item.label}
                    </Tag>
                  ))}
                </Flex>
              );
            }}
            items={tabItems}
          />
        )}
      </div>
      {independentDetails ? (
        <Modal
          open={Boolean(selectedEvent)}
          onCancel={() => setSelectedEvent(null)}
          footer={null}
          width="min(860px, 92vw)"
          title={String(selectedEvent?.type || "Event")}
          destroyOnHidden
        >
          <pre className="event-json">{JSON.stringify(selectedEvent, null, 2)}</pre>
        </Modal>
      ) : null}
    </div>
  );
};

export const DebugTab: React.FC = () => <DebugPanelContent />;
