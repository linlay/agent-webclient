import React from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import { parseConversationSnapshot } from "./conversationSnapshot";
import {
  conversationExportMessages,
  resolveConversationExportLocale,
} from "@/shared/i18n/conversationExport";
import { ConversationExportDocument } from "./ConversationExportDocument";

const CONVERSATION_SNAPSHOT_ELEMENT_ID = "conversation-snapshot";
const ROOT_ELEMENT_ID = "root";

function readSnapshot(): string {
  const snapshot = document
    .getElementById(CONVERSATION_SNAPSHOT_ELEMENT_ID)
    ?.textContent?.trim();
  if (!snapshot) throw new Error("snapshot_missing");
  return snapshot;
}

function showFailure(root: HTMLElement): void {
  const locale = resolveConversationExportLocale();
  root.replaceChildren();
  const message = document.createElement("p");
  message.className = "export-error";
  message.textContent = conversationExportMessages[locale].failure;
  root.append(message);
}

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
if (!rootElement) throw new Error("export_root_missing");

try {
  const snapshot = parseConversationSnapshot(readSnapshot());
  if (!snapshot) throw new Error("snapshot_invalid");
  const locale = resolveConversationExportLocale();
  const copy = conversationExportMessages[locale];
  document.documentElement.lang = locale;
  document.documentElement.dataset.theme = globalThis.matchMedia?.(
    "(prefers-color-scheme: dark)",
  ).matches
    ? "dark"
    : "light";
  document.title = `${snapshot.title} - ${copy.snapshotBadge}`;
  createRoot(rootElement).render(
    <ConversationExportDocument locale={locale} snapshot={snapshot} />,
  );
} catch {
  showFailure(rootElement);
}
