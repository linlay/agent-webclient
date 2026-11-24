/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { ContentViewerPanel } from "./ContentViewerPanel";
import { buildFileViewerTarget } from "../lib/viewerTarget";
import { getAgentFile } from "@/shared/data";
import { initializeDesktopContextMenuBridge } from "@/shared/data/desktop/desktopContextMenu";
import { I18nProvider } from "@/shared/i18n";

jest.mock("@/app/state/AppContext", () => ({ useAppState: () => ({ chatId: "", chats: [] }) }));
jest.mock("@/shared/data", () => ({
  ...jest.requireActual("@/shared/data"),
  getAgentFile: jest.fn(),
}));
jest.mock("@/shared/data/desktop/desktopHostBridge", () => ({
  ...jest.requireActual("@/shared/data/desktop/desktopHostBridge"),
  hasDesktopHostBridge: () => true,
  postDesktopHostMessage: jest.fn(),
}));

const mockRevealLineInCenter = jest.fn();
const mockLineDecorations = { clear: jest.fn(), set: jest.fn() };
jest.mock("@/shared/ui/CodeEditor", () => ({
  CodeEditor: ({ disabled, onChange, onMount, value }: {
    disabled: boolean;
    onChange: (value: string) => void;
    onMount: (editor: unknown) => void;
    value: string;
  }) => {
    const content = React.useRef(value);
    content.current = value;
    React.useLayoutEffect(() => {
      const dispose = jest.fn();
      onMount({
        createDecorationsCollection: jest.fn()
          .mockReturnValueOnce({ getRanges: () => [], set: jest.fn() })
          .mockReturnValueOnce(mockLineDecorations),
        getModel: () => ({ getLineCount: () => content.current.split("\n").length }),
        onDidChangeCursorSelection: () => ({ dispose }),
        onDidChangeModelContent: () => ({ dispose }),
        onDidDispose: jest.fn(),
        revealLineInCenter: mockRevealLineInCenter,
      });
    }, [onMount]);
    return <textarea readOnly={disabled} value={value} onChange={(event) => onChange(event.currentTarget.value)} />;
  },
}));

it("reveals the route line and repeats host jumps without reloading edited YAML", async () => {
  const path = "tools/shell_bash.yml";
  const target = buildFileViewerTarget({ agentKey: "agent", path, line: 13 })!;
  const content = Array.from({ length: 30 }, (_, index) => `# line ${index + 1}`).join("\n");
  const readFile = jest.mocked(getAgentFile);
  readFile.mockResolvedValue({
    data: {
      agentKey: "agent", requestedPath: path, name: "shell_bash.yml",
      contentKind: "text", documentKind: "document-code", content, revision: "rev-1",
      truncated: false,
    },
  } as Awaited<ReturnType<typeof getAgentFile>>);

  let receiveHostAction: (event: unknown, action: unknown) => void = () => undefined;
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: { onFromMain: (_channel: string, listener: typeof receiveHostAction) => {
      receiveHostAction = listener;
      return () => undefined;
    } },
  });
  const disconnect = initializeDesktopContextMenuBridge();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const render = (editing: boolean) => (
    <I18nProvider locale="zh-CN" persistLocale={false}>
      <ContentViewerPanel target={target} textEditMode={editing} />
    </I18nProvider>
  );
  const jump = (line: number, revision: number, targetKey = `file:agent:${path}`) =>
    receiveHostAction({}, { action: "workPanel.file.revealLine", version: 1, line, revision, targetKey });

  try {
    await act(async () => root.render(render(false)));
    expect(container.querySelector("textarea")?.readOnly).toBe(true);
    expect(mockRevealLineInCenter).toHaveBeenLastCalledWith(13);
    expect(mockLineDecorations.set).toHaveBeenLastCalledWith([expect.objectContaining({
      range: expect.objectContaining({ startLineNumber: 13, endLineNumber: 13 }),
      options: expect.objectContaining({ isWholeLine: true }),
    })]);

    await act(async () => root.render(render(true)));
    const editor = container.querySelector("textarea")!;
    const draft = `${content}\n# unsaved`;
    await act(async () => {
      editor.value = draft;
      Simulate.change(editor);
    });

    mockRevealLineInCenter.mockClear();
    await act(async () => jump(13, 1));
    await act(async () => jump(13, 2));
    await act(async () => jump(25, 3));
    await act(async () => jump(10, 2));
    await act(async () => jump(10, 4, "file:agent:other.yml"));
    expect(mockRevealLineInCenter.mock.calls).toEqual([[13], [13], [25]]);
    expect(container.querySelector("textarea")).toBe(editor);
    expect(editor.value).toBe(draft);
    expect(readFile).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    disconnect();
    Reflect.deleteProperty(window, "electronAPI");
    delete actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  }
});
