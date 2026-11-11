import React, { useEffect, useState } from "react";
import { ensureEmbedToken, emitEmbedEvent } from "@/shared/data/embed/embedSession";
import { isEmbedMode } from "@/shared/config/embed";
import { startEmbedBridge } from "../lib/embedBridge";
import { useI18n } from "@/shared/i18n";

/** Mount business providers only after a trusted parent supplies a scoped credential. */
export function EmbedBoundary({ children }: React.PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [authBlocked, setAuthBlocked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const { t } = useI18n();
  useEffect(() => {
    if (!isEmbedMode()) return;
    return startEmbedBridge({ onInit: () => { setError(""); setReady(true); }, onError: setError });
  }, []);
  useEffect(() => {
    if (!isEmbedMode()) return;
    const onAuth = (event: Event) => {
      const type = (event as CustomEvent).detail?.type;
      if (type === "auth.required") setAuthBlocked(true);
      if (type === "auth.ready") setAuthBlocked(false);
    };
    window.addEventListener("agent:embed-event", onAuth);
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (href.startsWith("#") || (anchor.hasAttribute("download") && href.startsWith(`blob:${window.location.origin}/`))) return;
      event.preventDefault();
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password) {
          event.stopPropagation();
          window.open(url.href, "_blank", "noopener,noreferrer");
          emitEmbedEvent("link.open", { url: url.href });
        }
      } catch { /* An invalid URL stays inside this surface. */ }
    };
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("agent:embed-event", onAuth); };
  }, []);
  if (!isEmbedMode()) return <>{children}</>;
  if (ready) return <>{children}{authBlocked && <div role="alert" style={{ position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeContent: "center", background: "var(--panel-surface)", gap: 16, padding: 24 }}>
    <p>{t("embed.loginRequired")}</p>
    <button type="button" disabled={refreshing} onClick={() => {
      setRefreshing(true);
      void ensureEmbedToken(true).then(() => window.dispatchEvent(new CustomEvent("agent:embed-auth-recovered")))
        .catch(() => undefined).finally(() => setRefreshing(false));
    }}>{t("embed.retryAuth")}</button>
  </div>}</>;
  return <main role={error ? "alert" : "status"} style={{ padding: 24, fontFamily: "sans-serif" }}>
    {t(error === "auth_required" ? "embed.loginRequired" : error ? "embed.unauthorized" : "embed.authorizing")}
    {error && <p><code>{error}</code></p>}
  </main>;
}
