import React from "react";
import { Alert, Button, Flex } from "antd";
import { readPublishedKnowledge, downloadPublishedKnowledge } from "@/shared/data/api/requests/kbases";
import { t } from "@/shared/i18n";

/** Published references are resolved by library authorization, independently of Workspace. */
export function KnowledgeSourceRead({chatId, sourceId, name}: {chatId: string; sourceId: string; name: string}) {
 const [text, setText] = React.useState<string | null>(null);
 const [offset, setOffset] = React.useState(0);
 const [more, setMore] = React.useState(false);
 const [busy, setBusy] = React.useState(false);
 const [error, setError] = React.useState("");
 const controller = React.useRef<AbortController | null>(null);
 React.useEffect(() => () => controller.current?.abort(), []);
 async function run(download = false) {
  controller.current?.abort(); const current = new AbortController(); controller.current = current;
  setBusy(true); setError("");
  try {
   if (download) {
    const blob = await downloadPublishedKnowledge(chatId, sourceId, current.signal);
    if (current.signal.aborted) return;
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
   } else {
    const result = (await readPublishedKnowledge(chatId, sourceId, offset, current.signal)).data;
    if (current.signal.aborted || !result) return;
    setText(previous => (previous ? previous + "\n" : "") + (result.content || ""));
    setOffset(result.endLine ? result.endLine + 1 : offset + 200); setMore(Boolean(result.hasMore));
   }
  } catch (e) { if (!current.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
  finally { if (!current.signal.aborted) setBusy(false); }
 }
 return <div style={{padding: "0 12px 8px", maxHeight: "60%", overflow: "auto"}}>
  <Flex gap={8}>
   {(text === null || more) && <Button size="small" disabled={busy} onClick={() => void run()}>{t(text === null ? "knowledge.source.read" : "knowledge.source.more")}</Button>}
   <Button size="small" disabled={busy} onClick={() => void run(true)}>{t("knowledge.source.download")}</Button>
   {text !== null && <Button size="small" disabled={busy} onClick={() => {setText(null);setOffset(0);setMore(false);}}>{t("knowledge.source.close")}</Button>}
  </Flex>
  {error && <Alert type="error" message={error} />}
  {text !== null && <pre style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit"}}>{text}</pre>}
 </div>;
}
