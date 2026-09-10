import type { editor } from "monaco-editor";
import type { ThemeMode } from "@/shared/styles/appearance/bootstrap";
import { opaqueColor } from "./documentAppearance";

export function createCodeEditorAppearanceTheme(mode: ThemeMode, read: (name: string) => string): editor.IStandaloneThemeData {
  const base = read("--bg-base") || (mode === "dark" ? "#181818" : "#ffffff");
  const input = opaqueColor(read("--control-input-bg") || base, base);
  // Monaco requires hex colors; composite translucent skin values on the same
  // solid reading surface as native inputs, not on the underlying photograph.
  const hex = (color: string) => "#" + opaqueColor(color, input).match(/\d+/g)!.map(channel => Number(channel).toString(16).padStart(2, "0")).join("");
  const color = (token: string) => hex(read(token) || input);
  return {
    base: mode === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [{ token: "comment", foreground: color("--ink-soft").slice(1) }],
    colors: {
      "editor.background": hex(input),
      "editor.foreground": color("--ink"),
      "editorGutter.background": hex(input),
      "editorLineNumber.foreground": color("--ink-muted"),
      "editorLineNumber.activeForeground": color("--ink"),
      "editorCursor.foreground": color("--ink"),
      "editor.lineHighlightBackground": color("--control-hover-bg"),
      "editor.lineHighlightBorder": color("--control-hover-bg"),
      "editor.selectionBackground": color("--nav-selected-bg"),
      "editor.inactiveSelectionBackground": color("--control-hover-bg"),
      "editor.selectionHighlightBackground": color("--accent-soft"),
      "editorIndentGuide.background1": color("--line"),
      "editorIndentGuide.activeBackground1": color("--line-strong"),
      "editorWhitespace.foreground": color("--line-strong"),
      "editorWidget.background": color("--control-popover-bg"),
      "editorWidget.foreground": color("--ink"),
      "editorWidget.border": color("--control-border"),
      "editorSuggestWidget.background": color("--control-popover-bg"),
      "editorSuggestWidget.foreground": color("--ink"),
      "editorSuggestWidget.selectedBackground": color("--nav-selected-bg"),
      "editorSuggestWidget.border": color("--control-border"),
      "scrollbarSlider.background": color("--line"),
      "scrollbarSlider.hoverBackground": color("--line-strong"),
      "scrollbarSlider.activeBackground": color("--nav-selected-bg"),
      "focusBorder": color("--accent"),
    },
  };
}
