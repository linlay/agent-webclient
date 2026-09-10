import { createContext } from "react";
import type { editor } from "monaco-editor";

// Shared editors receive the resolved palette without depending on a feature.
export const CodeEditorThemeContext = createContext<editor.IStandaloneThemeData | null>(null);
export const CODE_EDITOR_SKIN_THEME = "agent-webclient-skin";
