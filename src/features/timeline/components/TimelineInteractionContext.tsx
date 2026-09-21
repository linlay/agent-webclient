import React, { createContext, useContext } from "react";
import type { TimelineAttachment, TimelineNode, TimelineSource } from "@/features/timeline/lib/timelineState";
import type { OpenTargetIntent } from "@/features/surfaces/openTarget";
import type { ContentSegment } from "@/shared/contracts/contentSegments";
import type { MarkdownContentProps } from "@/features/viewers/components/MarkdownContent";
import type { DesktopContextMenuTargetDescriptor } from "@/shared/data/desktop/desktopContextMenu";

export interface TimelineInteractionValue {
  conversationActive?: boolean;
  readOnly?: boolean;
  surfaceContext?: {
    chatId: string;
    agentKey?: string;
    teamChat?: boolean;
  };
  setExpanded?: (nodeId: string, expanded: boolean) => void;
  setVoiceBlockExpanded?: (nodeId: string, signature: string, expanded: boolean, text: string, closed: boolean) => void;
  capturedAt?: number;
  openSource?: (source: TimelineSource, node?: TimelineNode) => void;
  openTarget?: (target: OpenTargetIntent) => void;
  replayVoice?: (node: TimelineNode, signature: string, text: string) => void;
  renderToolView?: (view: NonNullable<TimelineNode["view"]>, chatId: string, error: string | undefined, payloadRaw: string) => React.ReactNode;
  renderToolOutput?: (output: NonNullable<TimelineNode["toolOutput"]>) => React.ReactNode;
  renderContentView?: (segment: ContentSegment, chatId: string) => React.ReactNode;
  renderContentViewport?: (segment: ContentSegment) => React.ReactNode;
  renderMarkdown?: (props: MarkdownContentProps) => React.ReactNode;
  renderAttachment?: (attachment: TimelineAttachment, options: {
    density?: "default" | "compact";
    displayMode?: "auto" | "file" | "preview";
    subtitle?: string;
  }) => React.ReactNode;
  registerContextMenuTarget?: (element: Element, descriptor: DesktopContextMenuTargetDescriptor) => () => void;
}

const TimelineInteractionContext =
  createContext<TimelineInteractionValue | null>(null);

export const TimelineInteractionProvider =
  TimelineInteractionContext.Provider;

export function useTimelineInteraction(): TimelineInteractionValue | null {
  return useContext(TimelineInteractionContext);
}

export function useTimelineContextMenuTarget<T extends Element>(
  descriptor: DesktopContextMenuTargetDescriptor,
): React.RefCallback<T> {
  const register = useTimelineInteraction()?.registerContextMenuTarget;
  const cleanup = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => cleanup.current?.(), []);
  return React.useCallback((element: T | null) => {
    cleanup.current?.();
    cleanup.current = element && register ? register(element, descriptor) : null;
  }, [descriptor, register]);
}
