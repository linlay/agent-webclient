import React from "react";
import { createRoot } from "react-dom/client";
import "@/shared/styles/globals.css";
import "katex/dist/katex.min.css";
import { parseConversationSnapshotV1 } from "./conversationSnapshotV1";
import { conversationExportMessages, resolveConversationExportLocale } from "@/shared/i18n/conversationExport";
import { I18nProvider } from "@/shared/i18n";
import { ConversationExportDocument } from "./ConversationExportDocument";
import {
  applyConversationExportFavicon,
  readLocalExportBrandId,
  readPublicShareBrand,
} from "./publicShareBrand";

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
  const snapshot = parseConversationSnapshotV1(readSnapshot());
  if (!snapshot) throw new Error("snapshot_invalid");
  const locale = snapshot.locale;
  const copy = conversationExportMessages[locale];
  document.documentElement.lang = locale;
  document.documentElement.dataset.theme = globalThis.matchMedia?.(
    "(prefers-color-scheme: dark)",
  ).matches
    ? "dark"
    : "light";
  document.title = `${snapshot.title} - ${copy.snapshotBadge}`;
  const publicBrand = readPublicShareBrand();
  applyConversationExportFavicon(publicBrand?.id || readLocalExportBrandId());
  createRoot(rootElement).render(
    <I18nProvider locale={locale} persistLocale={false}>
      <ConversationExportDocument snapshot={snapshot} publicBrand={publicBrand} />
    </I18nProvider>,
  );
} catch {
  showFailure(rootElement);
}
