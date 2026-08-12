import React from "react";
import ReactDOM from "react-dom/client";
import {
  configureI18nRuntime,
  I18nProvider,
  normalizeLocale,
} from "@/shared/i18n";
import { readConversationShareId } from "@/shared/data/conversationShare";
import { SharedConversationPage } from "@/share/SharedConversationPage";
import "katex/dist/katex.min.css";

const locale = normalizeLocale(
  typeof navigator === "undefined" ? "en-US" : navigator.language,
);
configureI18nRuntime({ locale });
document.documentElement.lang = locale;
document.documentElement.dataset.theme =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("share root element is missing");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <I18nProvider locale={locale} persistLocale={false}>
      <SharedConversationPage
        shareId={readConversationShareId(window.location.pathname)}
      />
    </I18nProvider>
  </React.StrictMode>,
);
