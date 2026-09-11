import React, { useMemo, useState } from "react";
import { Badge, message, Popover } from "antd";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppContext } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { selectPinnedChats, buildPinnedChatMove } from "@/features/chats/lib/chatPinning";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { useChatPinActions } from "@/features/chats/hooks/useChatPinActions";
import { toWorkerConversationRow } from "@/features/workers/lib/workerConversationFormatter";
import type { WorkerConversationRow } from "@/features/workers/lib/workerState";
import { WorkerChatPreviewItem } from "./WorkerChatPreviewItem";
import "./PinnedChatSection.module.css";

function PinnedChatItem({ chat, ownerLabel, active, loading, disabled, onSelect }: {
  chat: WorkerConversationRow;
  ownerLabel: string;
  active: boolean;
  loading: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: chat.chatId, disabled });
  return <div ref={setNodeRef} className="pinned-chat-row" data-dragging={isDragging || undefined}
    style={{ transform: CSS.Transform.toString(transform), transition }}>
    <button ref={setActivatorNodeRef} className="pinned-chat-handle" type="button"
      {...attributes} {...listeners} disabled={disabled}
      aria-label={t("leftSidebar.pinned.reorder", { name: chat.chatName || chat.chatId })}>
      <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="4" r="1.3" /><circle cx="9" cy="4" r="1.3" /><circle cx="3" cy="9" r="1.3" /><circle cx="9" cy="9" r="1.3" /><circle cx="3" cy="14" r="1.3" /><circle cx="9" cy="14" r="1.3" /></svg>
    </button>
    <WorkerChatPreviewItem chat={chat} ownerLabel={ownerLabel} isActive={active} loading={loading} onClick={onSelect} />
  </div>;
}

export function PinnedChatSection({ collapsed, onSelectChat, getChatLoading }: {
  collapsed: boolean;
  onSelectChat: (chatId: string) => void;
  getChatLoading: (chatId: string) => boolean;
}) {
  const { state } = useAppContext();
  const { t } = useI18n();
  const { update, pending } = useChatPinActions();
  const [expanded, setExpanded] = useState(true);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const pinned = useMemo(() => selectPinnedChats(state.chats, state.chatPinnedOrder), [state.chats, state.chatPinnedOrder]);
  const filter = state.chatFilter.trim().toLocaleLowerCase();
  const rows = pinned.map((chat) => {
    const teamId = chat.teamId || (chat.owner?.kind === "orchestrated-team" ? chat.owner.teamId : undefined);
    const agentKey = chat.agentKey || chat.firstAgentKey;
    const ownerLabel = teamId
      ? state.teams.find((team) => team.teamId === teamId)?.name || teamId
      : state.agents.find((agent) => agent.key === agentKey)?.name || chat.firstAgentName || agentKey || "";
    return { chat: toWorkerConversationRow(chat), ownerLabel };
  }).filter(({ chat, ownerLabel }) => !filter || `${chat.chatName} ${chat.lastRunContent} ${ownerLabel}`.toLocaleLowerCase().includes(filter));
  if (pinned.length === 0) return null;

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (pending || filter || !over) return;
    const request = buildPinnedChatMove(state.chatPinnedOrder ?? [], String(active.id), String(over.id));
    if (request) void update(request).catch(() => message.error(t("chatActions.pin.failed")));
  };
  const content = <div className="pinned-chat-list">
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rows.map(({ chat }) => chat.chatId)} strategy={verticalListSortingStrategy}>
        {rows.map(({ chat, ownerLabel }) => <PinnedChatItem key={chat.chatId} chat={chat} ownerLabel={ownerLabel}
          active={state.chatId === chat.chatId} loading={getChatLoading(chat.chatId)} disabled={pending || Boolean(filter)}
          onSelect={() => { setPopoverOpen(false); onSelectChat(chat.chatId); }} />)}
      </SortableContext>
    </DndContext>
    {rows.length === 0 && <div className="status-line">{t("leftSidebar.pinned.noMatches")}</div>}
  </div>;
  const needsAttention = pinned.some((chat) => isChatUnread(chat) || chat.hasPendingAwaiting || chat.hasActiveRun || chat.activeRun);
  if (collapsed) return <div className="pinned-chat-rail">
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen} trigger="click" placement="rightTop" arrow={false}
      title={t("leftSidebar.pinned")} content={content} styles={{ body: { width: "var(--left-sidebar-width)" } }}>
      <button type="button" className="pinned-chat-rail-button" aria-label={t("leftSidebar.pinned")} aria-expanded={popoverOpen}>
        <Badge dot={needsAttention}><MaterialIcon name="push_pin" /></Badge>
      </button>
    </Popover>
  </div>;
  return <section className="pinned-chat-section" aria-label={t("leftSidebar.pinned")}>
    <button type="button" className="pinned-chat-heading" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <MaterialIcon name={expanded ? "expand_more" : "chevron_right"} />
      <MaterialIcon name="push_pin" />
      <span>{t("leftSidebar.pinned")}</span><span className="pinned-chat-count">{pinned.length}</span>
      {!expanded && <Badge dot={needsAttention} />}
    </button>
    {expanded && content}
  </section>;
}
