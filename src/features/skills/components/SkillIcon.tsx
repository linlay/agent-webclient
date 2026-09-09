import { useEffect, useState } from "react";
import { fetchSkillIcon } from "@/shared/data";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./SkillIcon.module.css";

export function SkillIcon({ icon, size = 18 }: { icon?: string; size?: number }) {
  const url = icon?.trim() || "";
  const [loaded, setLoaded] = useState<{ url: string; src: string } | null>(null);
  useEffect(() => {
    if (!url || typeof URL.createObjectURL !== "function") return;
    const controller = new AbortController();
    let objectUrl = "";
    void fetchSkillIcon(url, { signal: controller.signal }).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ url, src: objectUrl });
    }).catch(() => { /* Unavailable icons keep the default skill symbol. */ });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  const src = loaded?.url === url ? loaded.src : "";
  return <span className={styles.icon} style={{ width: size, height: size }} aria-hidden="true">
    {src ? <img src={src} alt="" onError={() => setLoaded(previous => previous?.src === src ? null : previous)} />
      : <MaterialIcon name="skills" style={{ fontSize: size }} />}
  </span>;
}
