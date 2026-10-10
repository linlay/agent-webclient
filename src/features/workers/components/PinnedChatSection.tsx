import libraryPresentation from "@/shared/ui/Presentation.module.css";
import React, { useMemo, useState } from "react";
import { Badge, Popover } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { selectPinnedChats } from "@/features/chats/lib/chatPinning";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { toWorkerConversationRow } from "@/features/workers/lib/workerConversationFormatter";
import { WorkerChatPreviewItem } from "./WorkerChatPreviewItem";
import "./PinnedChatSection.module.css";
import { UiButton } from "@/shared/ui/UiButton";
import navigationStyles from "./SidebarAgentNavigation.module.css";

export function PinnedChatSection({
  collapsed,
  onSelectChat,
  getChatLoading,
}: {
  collapsed: boolean;
  onSelectChat: (chatId: string) => void;
  getChatLoading: (chatId: string) => boolean;
}) {
  const { state } = useAppContext();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const pinned = useMemo(
    () => selectPinnedChats(state.chats, state.chatPinnedOrder),
    [state.chats, state.chatPinnedOrder],
  );
  const rows = pinned.map((chat) => {
    const agentKey = chat.agentKey || chat.firstAgentKey;
    const agent = state.agents.find((item) => item.key === agentKey);
    return {
      chat: toWorkerConversationRow(chat),
      ownerLabel: agent?.name || chat.firstAgentName || agentKey || "",
      ownerType: agent ? ("agent" as const) : undefined,
      ownerIcon: agent?.icon,
    };
  });
  if (pinned.length === 0) return null;

  const content = (
    <div className="pinned-chat-list">
      {rows.map(({ chat, ownerLabel, ownerType, ownerIcon }) => (
        <WorkerChatPreviewItem
          key={chat.chatId}
          chat={chat}
          ownerLabel={ownerLabel}
          ownerType={ownerType}
          ownerIcon={ownerIcon}
          ownerPosition="before"
          isActive={state.chatId === chat.chatId}
          loading={getChatLoading(chat.chatId)}
          onClick={() => {
            setPopoverOpen(false);
            onSelectChat(chat.chatId);
          }}
        />
      ))}
    </div>
  );
  const needsAttention = pinned.some(
    (chat) =>
      isChatUnread(chat) ||
      chat.hasPendingAwaiting ||
      chat.hasActiveRun ||
      chat.activeRun,
  );
  if (collapsed)
    return (
      <div className="pinned-chat-rail">
        <Popover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          placement="rightTop"
          arrow={false}
          title={
            <div className="tw:px-2 tw:pt-2">{t("leftSidebar.pinned")}</div>
          }
          content={content}
          styles={{ body: { width: "var(--left-sidebar-width)", padding: 0 } }}
        >
          <UiButton
            size="sm"
            variant="ghost"
            className="ui-icon-hover-24"
            iconOnly
            aria-label={t("leftSidebar.pinned")}
            aria-expanded={popoverOpen}
          >
            <Badge
              dot={needsAttention}
              className={libraryPresentation.badge}
              styles={{
                root: {
                  color: "inherit",
                },
              }}
            >
              <MaterialIcon name="push_pin" />
            </Badge>
          </UiButton>
        </Popover>
      </div>
    );
  return (
    <section
      className="pinned-chat-section"
      aria-label={t("leftSidebar.pinned")}
    >
      <div className={navigationStyles.heading}>
        <button
          type="button"
          className={`${navigationStyles.sectionTitle} pinned-chat-heading`}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <Badge
            dot={needsAttention}
            className={libraryPresentation.badge}
            styles={{ root: { color: "inherit", fontSize: "inherit" } }}
          >
            <span>{t("leftSidebar.pinned")}</span>
          </Badge>
          <span className="pinned-chat-count">({pinned.length})</span>
          <MaterialIcon name={expanded ? "expand_more" : "chevron_right"} />
        </button>
      </div>
      {expanded && content}
    </section>
  );
}
