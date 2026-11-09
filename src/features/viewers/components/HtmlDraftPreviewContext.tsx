import { createContext } from "react";

/** The Markdown owner's identity; never infer it from whichever Chat is now active. */
export const HtmlDraftPreviewContext = createContext<{ agentKey: string; chatId: string } | null>(null);
