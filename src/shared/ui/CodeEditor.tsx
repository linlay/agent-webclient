import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import type * as MonacoTypes from "monaco-editor";
import { Input, Button, Space, Flex } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "./MaterialIcon";
import { UiButton } from "./UiButton";
import { CODE_EDITOR_SKIN_THEME, CodeEditorThemeContext } from "./CodeEditorThemeContext";

// monaco 体积近 10MB，首次打开编辑器时异步加载；加载后注入本地包，避免 @monaco-editor/react 回退 CDN
let monacoLoaderPromise: Promise<void> | null = null;
function ensureMonacoConfigured(): Promise<void> {
  if (!monacoLoaderPromise) {
    monacoLoaderPromise = import("monaco-editor").then((monacoNs) => {
      loader.config({ monaco: monacoNs });
    });
  }
  return monacoLoaderPromise;
}

export interface CodeEditorProps {
  value: string;
  language?: string;
  path?: string;
  theme?: "light" | "dark";
  disabled?: boolean;
  className?: string;
  options?: MonacoTypes.editor.IStandaloneEditorConstructionOptions;
  onChange?: (value: string) => void;
  onMount?: (
    editor: MonacoTypes.editor.IStandaloneCodeEditor,
    monaco: Monaco,
  ) => void;
}

interface FindState {
  open: boolean;
  mode: "find" | "replace";
  query: string;
  replaceWith: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  activeMatch: number;
  totalMatches: number;
}

const EMPTY_FIND: FindState = {
  open: false,
  mode: "find",
  query: "",
  replaceWith: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  activeMatch: 0,
  totalMatches: 0,
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMatches(
  editor: MonacoTypes.editor.IStandaloneCodeEditor,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  regex: boolean,
): MonacoTypes.editor.FindMatch[] {
  if (!query) return [];
  const model = editor.getModel();
  if (!model) return [];
  // 全词匹配：用正则词界包装（Monaco 0.56 的 findMatches 无 matchWholeWord 参数）
  const raw = regex ? query : escapeRegExp(query);
  const pattern = wholeWord ? `\\b${raw}\\b` : raw;
  try {
    return model.findMatches(pattern, true, true, caseSensitive, null, true);
  } catch (err) {
    // 无效正则：静默忽略，与 Monaco 默认行为一致
    return [];
  }
}

// 每个 editor 持久持有唯一的 decorations collection，用 set() 增量替换；
// 若每次 createDecorationsCollection 新建集合，旧集合的装饰不会被清除，关闭后高亮会残留
const decorationCollections = new WeakMap<
  MonacoTypes.editor.IStandaloneCodeEditor,
  MonacoTypes.editor.IEditorDecorationsCollection
>();

function applyDecorations(
  editor: MonacoTypes.editor.IStandaloneCodeEditor,
  matches: MonacoTypes.editor.FindMatch[],
  activeIndex: number,
) {
  let collection = decorationCollections.get(editor);
  if (!collection) {
    collection = editor.createDecorationsCollection();
    decorationCollections.set(editor, collection);
  }
  const decorations: MonacoTypes.editor.IModelDeltaDecoration[] = matches.map(
    (m, i) => ({
      range: m.range,
      options: {
        inlineClassName:
          i === activeIndex
            ? "code-editor-find-match-active"
            : "code-editor-find-match",
      },
    }),
  );
  collection.set(decorations);
}

function revealMatch(
  editor: MonacoTypes.editor.IStandaloneCodeEditor,
  match: MonacoTypes.editor.FindMatch,
) {
  // 只选中并滚动到匹配处，不调用 editor.focus()：
  // 查找框输入时若抢焦点，会打断输入法组合输入与连续键入
  editor.setSelection(match.range);
  editor.revealRangeInCenter(match.range);
}

const FindOverlay: React.FC<{
  state: FindState;
  setState: React.Dispatch<React.SetStateAction<FindState>>;
  editor: MonacoTypes.editor.IStandaloneCodeEditor;
  onClose: () => void;
}> = ({ state, setState, editor, onClose }) => {
  const { t } = useI18n();
  const [rect, setRect] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const dom = editor.getContainerDomNode();
      if (!dom) return;
      const r = dom.getBoundingClientRect();
      setRect({ top: r.top + 8, right: window.innerWidth - r.right + 8 });
    };
    update();
    const ro = new ResizeObserver(update);
    const dom = editor.getContainerDomNode();
    if (dom) ro.observe(dom);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [editor]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  const recompute = (next: Partial<FindState>) => {
    const merged = { ...state, ...next };
    if (!merged.query) {
      setState({ ...merged, activeMatch: 0, totalMatches: 0 });
      applyDecorations(editor, [], -1);
      return;
    }
    const matches = findMatches(
      editor,
      merged.query,
      merged.caseSensitive,
      merged.wholeWord,
      merged.regex,
    );
    const first = matches[0];
    setState({
      ...merged,
      totalMatches: matches.length,
      activeMatch: matches.length ? 1 : 0,
    });
    applyDecorations(editor, matches, 0);
    if (first) revealMatch(editor, first);
  };

  const goto = (delta: number) => {
    if (!state.query) return;
    const matches = findMatches(
      editor,
      state.query,
      state.caseSensitive,
      state.wholeWord,
      state.regex,
    );
    if (!matches.length) return;
    const nextIdx =
      ((state.activeMatch - 1 + delta + matches.length) % matches.length) + 1;
    const target = matches[nextIdx - 1];
    setState({ ...state, activeMatch: nextIdx, totalMatches: matches.length });
    applyDecorations(editor, matches, nextIdx - 1);
    revealMatch(editor, target);
  };

  const replaceAll = () => {
    if (!state.query) return;
    const model = editor.getModel();
    if (!model) return;
    const matches = findMatches(
      editor,
      state.query,
      state.caseSensitive,
      state.wholeWord,
      state.regex,
    );
    if (!matches.length) return;
    const edits = matches
      .slice()
      .reverse()
      .map((m) => ({
        range: m.range,
        text: state.replaceWith,
      }));
    model.pushEditOperations([], edits, () => null);
    setState({ ...state, totalMatches: 0, activeMatch: 0 });
    applyDecorations(editor, [], -1);
  };

  const replaceOne = () => {
    if (!state.query) return;
    const model = editor.getModel();
    if (!model) return;
    const matches = findMatches(
      editor,
      state.query,
      state.caseSensitive,
      state.wholeWord,
      state.regex,
    );
    const target = matches[state.activeMatch - 1];
    if (!target) return;
    model.pushEditOperations(
      [],
      [{ range: target.range, text: state.replaceWith }],
      () => null,
    );
    recompute({});
  };

  if (!rect) return null;
  const status =
    state.totalMatches > 0
      ? `${state.activeMatch} / ${state.totalMatches}`
      : state.query
        ? t("codeEditor.find.noResults")
        : "";

  return (
    <Flex
      gap={4}
      style={{
        position: "fixed",
        top: rect.top,
        right: rect.right,
        zIndex: 1000,
        background: "var(--bg-base)",
        border: "1px solid var(--line-soft)",
        borderRadius: 8,
        padding: 4,
        boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
        minWidth: 360,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <UiButton
        size="sm"
        iconOnly
        variant="ghost"
        aria-label={t("codeEditor.find.toggleReplace")}
        style={{
          minHeight: 20,
          minWidth: 20,
          width: 20,
        }}
        onClick={() =>
          setState({
            ...state,
            mode: state.mode === "replace" ? "find" : "replace",
          })
        }
      >
        <MaterialIcon
          name={state.mode === "replace" ? "expand_more" : "chevron_right"}
        />
      </UiButton>
      <Flex vertical>
        <Flex align="center">
          <Input
            placeholder={t("codeEditor.find.placeholder")}
            value={state.query}
            size="small"
            autoFocus
            allowClear
            style={{ width: 200 }}
            onChange={(e) => recompute({ query: e.target.value })}
            onPressEnter={() => goto(1)}
          />
          <Space.Compact style={{ margin: "0 10px" }}>
            <Button
              size="small"
              type={state.caseSensitive ? "primary" : "default"}
              aria-label={t("codeEditor.find.caseSensitive")}
              onClick={() => recompute({ caseSensitive: !state.caseSensitive })}
            >
              <MaterialIcon name="match_case" />
            </Button>
            <Button
              size="small"
              type={state.wholeWord ? "primary" : "default"}
              aria-label={t("codeEditor.find.wholeWord")}
              onClick={() => recompute({ wholeWord: !state.wholeWord })}
            >
              <MaterialIcon name="match_word" />
            </Button>
            <Button
              size="small"
              type={state.regex ? "primary" : "default"}
              aria-label={t("codeEditor.find.regex")}
              onClick={() => recompute({ regex: !state.regex })}
            >
              .*
            </Button>
          </Space.Compact>
          <div className="tw:text-sm tw:text-text-muted mx-[10px]">
            {status}
          </div>
          <UiButton
            size="sm"
            iconOnly
            variant="ghost"
            className="ui-icon-hover-24"
            aria-label={t("codeEditor.find.previous")}
            onClick={() => goto(-1)}
          >
            <MaterialIcon name="arrow_upward" />
          </UiButton>
          <UiButton
            size="sm"
            iconOnly
            variant="ghost"
            className="ui-icon-hover-24"
            aria-label={t("codeEditor.find.next")}
            onClick={() => goto(1)}
          >
            <MaterialIcon name="arrow_downward" />
          </UiButton>
          <UiButton
            size="sm"
            iconOnly
            variant="ghost"
            className="ui-icon-hover-24"
            aria-label={t("codeEditor.find.close")}
            onClick={onClose}
          >
            <MaterialIcon name="close" />
          </UiButton>
        </Flex>
        {state.mode === "replace" && (
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 6,
              alignItems: "center",
            }}
          >
            <Input
              placeholder={t("codeEditor.find.replacePlaceholder")}
              value={state.replaceWith}
              size="small"
              style={{ width: 200 }}
              onChange={(e) =>
                setState({ ...state, replaceWith: e.target.value })
              }
            />
            <Button
              size="small"
              onClick={replaceOne}
              disabled={!state.totalMatches}
            >
              {t("codeEditor.find.replaceOne")}
            </Button>
            <Button
              size="small"
              onClick={replaceAll}
              disabled={!state.totalMatches}
            >
              {t("codeEditor.find.replaceAll")}
            </Button>
          </div>
        )}
      </Flex>
    </Flex>
  );
};

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  language,
  path,
  theme = "light",
  disabled = false,
  className = "",
  options,
  onChange,
  onMount,
}) => {
  const editorRef = useRef<MonacoTypes.editor.IStandaloneCodeEditor | null>(
    null,
  );
  const [find, setFind] = useState<FindState>(EMPTY_FIND);
  const [monacoReady, setMonacoReady] = useState(false);
  const skinTheme = useContext(CodeEditorThemeContext);
  const skinThemeRef = useRef(skinTheme);
  skinThemeRef.current = skinTheme;
  const monacoRef = useRef<Monaco | null>(null);
  const editorThemeName = skinTheme ? CODE_EDITOR_SKIN_THEME : theme === "dark" ? "vs-dark" : "vs";

  const prepareTheme = (monaco: Monaco) => {
    monacoRef.current = monaco;
    if (skinThemeRef.current) monaco.editor.defineTheme(CODE_EDITOR_SKIN_THEME, skinThemeRef.current);
  };
  useLayoutEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    if (skinTheme) monaco.editor.defineTheme(CODE_EDITOR_SKIN_THEME, skinTheme);
    monaco.editor.setTheme(editorThemeName);
  }, [skinTheme, editorThemeName]);

  useEffect(() => {
    let cancelled = false;
    void ensureMonacoConfigured().then(() => {
      if (!cancelled) setMonacoReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const closeFind = () => {
    const editor = editorRef.current;
    if (editor) {
      applyDecorations(editor, [], -1);
      // 通知内置 find controller 隐藏，清空搜索词，避免其遗留高亮与计数残留
      const controller = editor.getContribution(
        "editor.contrib.find",
      ) as unknown as {
        setState?: (state: Record<string, unknown>) => void;
        close?: () => void;
        getState?: () => unknown;
      } | null;
      controller?.setState?.({
        searchString: "",
        replaceString: "",
        isRevealed: false,
        isReplaceRevealed: false,
      });
      controller?.close?.();
    }
    setFind(EMPTY_FIND);
  };

  const handleMount = (
    editor: MonacoTypes.editor.IStandaloneCodeEditor,
    monaco: Monaco,
  ) => {
    editorRef.current = editor;
    onMount?.(editor, monaco);

    // 接管 Cmd/Ctrl+F（打开查找）与 Cmd/Ctrl+Shift+H（打开替换）
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      const model = editor.getModel();
      const selection = editor.getSelection();
      // 与 VS Code 一致：有非空单行选中文本时，总是用选中文本覆盖查询词
      const seed =
        selection && model && !selection.isEmpty()
          ? model.getValueInRange(selection)
          : "";
      const singleLine = !seed.includes("\n");
      setFind((prev) => {
        const query = singleLine && seed ? seed : prev.query;
        // 打开即执行一次搜索，避免"选中文本后 Cmd+F 未立即查找"
        const matches = query
          ? findMatches(
              editor,
              query,
              prev.caseSensitive,
              prev.wholeWord,
              prev.regex,
            )
          : [];
        applyDecorations(editor, matches, matches.length ? 0 : -1);
        if (matches[0]) revealMatch(editor, matches[0]);
        return {
          ...prev,
          open: true,
          // 保留已展开的替换模式（VS Code 同行为），Cmd+F 不收起替换行
          query,
          totalMatches: matches.length,
          activeMatch: matches.length ? 1 : 0,
        };
      });
    });
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyH,
      () => {
        setFind((prev) => ({ ...prev, open: true, mode: "replace" }));
      },
    );
  };

  const stylesheet = useMemo(() => {
    const id = "code-editor-find-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
			.code-editor-find-match { background: rgba(255, 220, 0, 0.35); }
			.code-editor-find-match-active { background: rgba(255, 145, 0, 0.55); }
		`;
    document.head.appendChild(style);
  }, []);

  if (!monacoReady) return null;

  return (
    <>
      <Editor
        className={["code-editor", className].filter(Boolean).join(" ")}
        value={value}
        language={language}
        path={path}
        theme={editorThemeName}
        beforeMount={prepareTheme}
        onChange={(next) => onChange?.(next ?? "")}
        onMount={handleMount}
        options={{
          readOnly: disabled,
          minimap: { enabled: false },
          automaticLayout: true,
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          lineNumbers: "off",
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: "on",
          hover: { enabled: "off" },
          fixedOverflowWidgets: true,
          find: { addExtraSpaceOnTop: false },
          ...options,
        }}
      />
      {stylesheet}
      {find.open && editorRef.current && (
        <FindOverlay
          state={find}
          setState={setFind}
          editor={editorRef.current}
          onClose={closeFind}
        />
      )}
    </>
  );
};
