import { useEffect, useState } from "react";
import { fetchConnectorIcon, type ConnectorSummary } from "@/shared/data";
import styles from "./ConnectorIcon.module.css";

export function ConnectorIcon({ item, size = 22, className = "" }: {
  item: Pick<ConnectorSummary, "iconUrl">;
  size?: number;
  className?: string;
}) {
  const url = item.iconUrl || "";
  const [loaded, setLoaded] = useState<{ url: string; src: string } | null>(null);
  useEffect(() => {
    if (!url || typeof URL.createObjectURL !== "function") return;
    const controller = new AbortController();
    let objectUrl = "";
    void fetchConnectorIcon(url, { signal: controller.signal }).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ url, src: objectUrl });
    }).catch(() => { /* Missing or unavailable package icons use the default connector mark. */ });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  const src = loaded?.url === url ? loaded.src : "";
  return <span className={`${styles.icon} ${!src ? styles.fallback : ""} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
    {src ? <img src={src} alt="" onError={() => setLoaded(previous => previous?.src === src ? null : previous)} />
      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false">
          <path d="M10 13a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.7 1.7" />
          <path d="M14 11a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.7-1.7" />
        </svg>}
  </span>;
}
