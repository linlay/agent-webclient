import React, { useMemo } from "react";
import { useOptionalAppContext } from "@/app/state/AppContext";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { useOpenTarget } from "@/features/surfaces/openTarget";
import { ToolOutputTerminal } from "@/features/terminal/components/ToolOutputTerminal";
import { type TimelineInteractionValue } from "@/features/timeline/components/TimelineInteractionContext";
import { ViewEmbed } from "@/features/timeline/components/ViewEmbed";
import { ViewportEmbed } from "@/features/timeline/components/ViewportEmbed";
import type {
  TimelineNode,
  TimelineSource,
} from "@/features/timeline/lib/timelineState";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import { MarkdownContent } from "@/features/viewers/components/MarkdownContent";
import { registerDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import type { BTWSessionState } from "@/features/btw/lib/btwTypes";

interface UseBtwTimelineInteractionOptions {
  parentChatId: string;
  session: BTWSessionState | null;
  running: boolean;
  onPatchTimelineNode: (node: TimelineNode) => void;
  onOpenSource?: (source: TimelineSource, node?: TimelineNode) => void;
}

export function useBtwTimelineInteraction({
  parentChatId,
  session,
  running,
  onPatchTimelineNode,
  onOpenSource,
}: UseBtwTimelineInteractionOptions): TimelineInteractionValue {
  const appContext = useOptionalAppContext();
  const openTarget = useOpenTarget();
  const timelineNodes = session?.projection.timelineNodes;
  const agentKey = String(session?.agentKey || "").trim();
  const btwId = String(session?.btwId || "").trim();
  const themeMode = appContext?.state.themeMode || "light";
  const teamChat = Boolean(
    appContext?.state.chats.some(
      (chat) =>
        chat.chatId === parentChatId &&
        (chat.owner?.kind === "orchestrated-team" || Boolean(chat.teamId)),
    ),
  );

  return useMemo<TimelineInteractionValue>(() => {
    const surfaceContext = {
      chatId: parentChatId,
      ...(agentKey ? { agentKey } : {}),
      teamChat,
    };

    return {
      conversationActive: running,
      readOnly: false,
      registerContextMenuTarget: registerDesktopContextMenuTarget,
      surfaceContext,
      setExpanded: (nodeId, expanded) => {
        const node = timelineNodes?.get(nodeId);
        if (node) onPatchTimelineNode({ ...node, expanded });
      },
      setVoiceBlockExpanded: (nodeId, signature, expanded, text, closed) => {
        const node = timelineNodes?.get(nodeId);
        if (!node) return;
        const current = node.ttsVoiceBlocks?.[signature] || {
          signature,
          text,
          closed,
          expanded: false,
          status: "ready" as const,
          error: "",
        };
        onPatchTimelineNode({
          ...node,
          ttsVoiceBlocks: {
            ...node.ttsVoiceBlocks,
            [signature]: { ...current, expanded },
          },
        });
      },
      openTarget,
      replayVoice: (node, signature, text) => {
        void getVoiceRuntime()
          ?.replayTtsVoiceBlock(node.contentId || "", signature, text)
          .catch(() => undefined);
      },
      renderToolView: (view, chatId, error, payloadRaw) => (
        <ViewEmbed
          chatId={chatId}
          view={view}
          viewError={error}
          payloadRaw={payloadRaw}
        />
      ),
      renderToolOutput: (output) => (
        <ToolOutputTerminal output={output} themeMode={themeMode} />
      ),
      renderContentView: (segment, chatId) =>
        segment.view ? (
          <ViewEmbed
            chatId={chatId}
            view={segment.view}
            payloadRaw={segment.payloadRaw || "{}"}
          />
        ) : null,
      renderContentViewport: (segment) => (
        <ViewportEmbed
          viewportKey={segment.key || ""}
          signature={segment.signature || ""}
          payload={segment.payload}
          payloadRaw={segment.payloadRaw}
        />
      ),
      renderMarkdown: (props) => <MarkdownContent {...props} />,
      renderAttachment: (attachment, options) => (
        <AttachmentCard
          attachment={attachment}
          variant="timeline"
          thumbnailMode="inline"
          surfaceContext={surfaceContext}
          {...options}
        />
      ),
      openSource: (source, node) => {
        if (onOpenSource) {
          onOpenSource(source, node);
          return;
        }
        const publishId = String(node?.sourcePublishId || "").trim();
        if (!publishId) return;
        openTarget({
          version: 1,
          kind: "source",
          chatId: parentChatId,
          ...(btwId ? { btwId } : {}),
          publishId,
          sourceId: source.id,
          source,
          title: source.title || source.name,
        });
      },
    };
  }, [
    agentKey,
    btwId,
    onOpenSource,
    onPatchTimelineNode,
    openTarget,
    parentChatId,
    running,
    teamChat,
    themeMode,
    timelineNodes,
  ]);
}
