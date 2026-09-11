import { useEffect, useState } from "react";
import { fetchConnectorIcon, type ConnectorSummary } from "@/shared/data";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
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
    }).catch(() => { /* Missing or unavailable package icons use the default hub. */ });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  const src = loaded?.url === url ? loaded.src : "";
  return <span className={`${styles.icon} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
    {src ? <img src={src} alt="" onError={() => setLoaded(previous => previous?.src === src ? null : previous)} />
      : <MaterialIcon name="hub" style={{ fontSize: size }} />}
  </span>;
}
