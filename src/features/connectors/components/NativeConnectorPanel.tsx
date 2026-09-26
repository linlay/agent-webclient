import { useEffect, useRef, useState } from "react";
import { getConnectorConnection, updateNativeConnectorConnection } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import styles from "./ConnectorsConsole.module.css";

export function NativeConnectorPanel({ id, disabled, onChange }: { id: string; disabled?: boolean; onChange?: () => void }) {
 const { t } = useI18n();
 const [configured, setConfigured] = useState<boolean | null>(null);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const current = useRef<AbortController | null>(null);
 useEffect(() => {
  const controller = new AbortController(); current.current = controller;
  setConfigured(null); setError(""); setBusy(false);
  void getConnectorConnection(id, controller.signal).then(response => { if (!controller.signal.aborted) setConfigured(response.data.configured); }).catch(err => { if (!controller.signal.aborted) setError(String(err)); });
  return () => { controller.abort(); current.current?.abort(); };
 }, [id]);
 const act = async (action: "connect" | "disconnect" | "check") => {
  current.current?.abort(); const controller = new AbortController(); current.current = controller;
  setBusy(true); setError("");
  try {
   await updateNativeConnectorConnection(id, action, controller.signal);
   const response = await getConnectorConnection(id, controller.signal);
   if (!controller.signal.aborted) { setConfigured(response.data.configured); onChange?.(); }
  } catch (err) { if (!controller.signal.aborted) setError(String(err)); }
  finally { if (!controller.signal.aborted) setBusy(false); }
 };
 return <section className={styles.group}>
  <UiTag>{configured === null ? t("connectors.auth.checking") : t(configured ? "connectors.native.configured" : "connectors.native.unconfigured")}</UiTag>
  <p>{t("connectors.native.hint")}</p>
  {error && <p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.actions}>
   <UiButton disabled={disabled || busy || configured === null} onClick={() => void act(configured ? "disconnect" : "connect")}>{t(configured ? "connectors.native.disconnect" : "connectors.native.connect")}</UiButton>
   <UiButton disabled={disabled || busy} onClick={() => void act("check")}>{t("connectors.native.check")}</UiButton>
  </div>
 </section>;
}
