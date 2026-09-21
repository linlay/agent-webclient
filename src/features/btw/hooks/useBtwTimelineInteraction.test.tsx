/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BTWSessionState } from "@/features/btw/lib/btwTypes";
import {
  TimelineInteractionProvider,
  useTimelineInteraction,
} from "@/features/timeline/components/TimelineInteractionContext";
import type {
  TimelineNode,
  TimelineSource,
} from "@/features/timeline/lib/timelineState";
import { AwaitingAnswerBlock } from "@/features/timeline/components/AwaitingAnswerBlock";
import { SourceBlock } from "@/features/timeline/components/SourceBlock";
import { ThinkingBlock } from "@/features/timeline/components/ThinkingBlock";
import { useBtwTimelineInteraction } from "./useBtwTimelineInteraction";

const mockOpenTarget = jest.fn();

jest.mock("@/app/state/AppContext", () => ({
  useOptionalAppContext: () => ({
    state: { themeMode: "dark", chats: [] },
  }),
}));
jest.mock("@/features/surfaces/openTarget", () => ({
  useOpenTarget: () => mockOpenTarget,
}));
jest.mock("@/features/artifacts/components/AttachmentCard", () => ({
  AttachmentCard: ({
    attachment,
    displayMode,
  }: {
    attachment: { name: string };
    displayMode?: string;
  }) => (
    <div data-testid="attachment" data-display-mode={displayMode}>
      {attachment.name}
    </div>
  ),
}));
jest.mock("@/features/terminal/components/ToolOutputTerminal", () => ({
  ToolOutputTerminal: () => <div data-testid="tool-output" />,
}));
jest.mock("@/features/timeline/components/ViewEmbed", () => ({
  ViewEmbed: () => <div data-testid="view-embed" />,
}));
jest.mock("@/features/timeline/components/ViewportEmbed", () => ({
  ViewportEmbed: () => <div data-testid="viewport-embed" />,
}));
jest.mock("@/features/viewers/components/MarkdownContent", () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}));
jest.mock("@/features/voice/lib/voiceRuntime", () => ({
  getVoiceRuntime: () => null,
}));
jest.mock("@/shared/data/desktop/desktopContextMenu", () => ({
  registerDesktopContextMenuTarget: jest.fn(),
}));
jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
jest.mock("@/shared/components/skeleton", () => ({
  Skeleton: ({ text }: { text: string }) => <span>{text}</span>,
}));
jest.mock("antd", () => ({
  Flex: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/shared/ui/TimelineCollapse", () => ({
  TimelineCollapse: ({
    children,
    expanded,
    label,
    onExpand,
  }: {
    children: React.ReactNode;
    expanded?: boolean;
    label: React.ReactNode;
    onExpand?: (expanded: boolean) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onExpand?.(!expanded)}>
        {label}
      </button>
      {expanded ? children : null}
    </div>
  ),
}));

const node: TimelineNode = {
  id: "thinking-1",
  kind: "thinking",
  runId: "run-1",
  text: "Reasoning",
  expanded: false,
  ts: 1,
};

const source: TimelineSource = {
  id: "source-1",
  name: "source.md",
  title: "Source",
  chunkIndexes: [],
  minIndex: 0,
  chunks: [],
};

const sourceNode: TimelineNode = {
  id: "source-node-1",
  kind: "source",
  runId: "run-1",
  sourceQuery: "docs",
  sources: [source],
  expanded: false,
  ts: 2,
};

const awaitingNode: TimelineNode = {
  id: "awaiting-1",
  kind: "awaiting-answer",
  runId: "run-1",
  text: "[]",
  expanded: false,
  ts: 3,
};

function createSession(): BTWSessionState {
  return {
    parentChatId: "chat-1",
    btwId: "btw-1",
    runId: "run-1",
    requestId: "request-1",
    agentKey: "agent-1",
    status: "idle",
    interruptReady: false,
    interruptPending: false,
    draft: "",
    draftSelections: [],
    error: "",
    focusToken: 0,
    lastSeq: 0,
    updatedAt: 1,
    usage: null,
    config: {},
    projection: {
      timelineNodes: new Map([
        [node.id, node],
        [sourceNode.id, sourceNode],
        [awaitingNode.id, awaitingNode],
      ]),
    } as BTWSessionState["projection"],
  };
}

const InteractionProbe: React.FC = () => {
  const interaction = useTimelineInteraction();
  const view = { connectorId: "connector", key: "result" };
  return (
    <div data-chat-id={interaction?.surfaceContext?.chatId}>
      <div data-testid="thinking-collapse">
        <ThinkingBlock node={node} />
      </div>
      <div data-testid="source-collapse">
        <SourceBlock node={sourceNode} />
      </div>
      <div data-testid="awaiting-collapse">
        <AwaitingAnswerBlock node={awaitingNode} />
      </div>
      <button
        type="button"
        aria-label="source"
        onClick={() =>
          interaction?.openSource?.(source, {
            ...node,
            sourcePublishId: "publish-1",
          })
        }
      />
      <button
        type="button"
        aria-label="target"
        onClick={() =>
          interaction?.openTarget?.({
            version: 1,
            kind: "web",
            url: "https://example.com/",
            title: "Example",
          })
        }
      />
      {interaction?.renderAttachment?.(
        { name: "report.html" },
        { displayMode: "preview" },
      )}
      {interaction?.renderToolView?.(view, "chat-1", undefined, "{}")}
      {interaction?.renderToolOutput?.({
        segments: [],
        lastChunkIndex: 0,
        truncated: false,
      })}
      {interaction?.renderContentView?.(
        { kind: "view", view, payloadRaw: "{}" },
        "chat-1",
      )}
      {interaction?.renderContentViewport?.({
        kind: "viewport",
        key: "viewport-1",
        signature: "signature-1",
        payload: {},
        payloadRaw: "{}",
      })}
      {interaction?.renderMarkdown?.({ content: "Answer", chatId: "chat-1" })}
    </div>
  );
};

const Harness: React.FC<{
  session: BTWSessionState;
  onPatchTimelineNode: (updated: TimelineNode) => void;
}> = ({ session, onPatchTimelineNode }) => {
  const interaction = useBtwTimelineInteraction({
    parentChatId: session.parentChatId,
    session,
    running: false,
    onPatchTimelineNode,
  });
  return (
    <TimelineInteractionProvider value={interaction}>
      <InteractionProbe />
    </TimelineInteractionProvider>
  );
};

describe("useBtwTimelineInteraction", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockOpenTarget.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("writes thinking, source and awaiting expansion back on real control clicks", () => {
    const onPatchTimelineNode = jest.fn();
    act(() => {
      root.render(
        <Harness
          session={createSession()}
          onPatchTimelineNode={onPatchTimelineNode}
        />,
      );
    });

    for (const testId of [
      "thinking-collapse",
      "source-collapse",
      "awaiting-collapse",
    ]) {
      act(() =>
        container
          .querySelector<HTMLButtonElement>(`[data-testid="${testId}"] button`)
          ?.click(),
      );
    }

    expect(onPatchTimelineNode.mock.calls.map(([updated]) => updated)).toEqual([
      { ...node, expanded: true },
      { ...sourceNode, expanded: true },
      { ...awaitingNode, expanded: true },
    ]);
  });

  it("provides BTW source, target, attachment, markdown and embedded renderers", () => {
    act(() => {
      root.render(
        <Harness session={createSession()} onPatchTimelineNode={jest.fn()} />,
      );
    });

    expect(container.firstElementChild?.getAttribute("data-chat-id")).toBe(
      "chat-1",
    );
    expect(
      container
        .querySelector('[data-testid="attachment"]')
        ?.getAttribute("data-display-mode"),
    ).toBe("preview");
    expect(
      container.querySelectorAll('[data-testid="view-embed"]'),
    ).toHaveLength(2);
    expect(
      container.querySelector('[data-testid="tool-output"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="viewport-embed"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="markdown"]')?.textContent,
    ).toBe("Answer");

    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="source"]')
        ?.click(),
    );
    expect(mockOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        kind: "source",
        chatId: "chat-1",
        btwId: "btw-1",
        publishId: "publish-1",
        sourceId: "source-1",
      }),
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="target"]')
        ?.click(),
    );
    expect(mockOpenTarget).toHaveBeenCalledWith({
      version: 1,
      kind: "web",
      url: "https://example.com/",
      title: "Example",
    });
  });
});
