import React, { useEffect, useState } from "react";
import { Alert, Button, Empty, Segmented, Space, Spin, Typography } from "antd";
import { getWebappLogs } from "@/shared/data";
import { getDataSessionRevision } from "@/shared/data/auth/dataSession";
import { useI18n } from "@/shared/i18n";

export function AppLogs({ id }: { id: string }) {
 const { t } = useI18n(); const session = getDataSessionRevision();
 const [stream,setStream] = useState<"stdout" | "stderr">("stdout"); const [revision,setRevision] = useState(0);
 const [text,setText] = useState(""); const [error,setError] = useState(""); const [loading,setLoading] = useState(true);
 useEffect(() => { const controller = new AbortController(); setText(""); setError(""); setLoading(true);
   getWebappLogs(id,stream,"",controller.signal).then(response => { if (!controller.signal.aborted && session === getDataSessionRevision()) setText(response.data.text); })
    .catch(e => { if (!controller.signal.aborted && session === getDataSessionRevision()) setError(e instanceof Error ? e.message : String(e)); })
    .finally(() => { if (!controller.signal.aborted) setLoading(false); });
   return () => controller.abort();
 }, [id,stream,revision,session]);
 return <Space direction="vertical" style={{width:"100%"}}>
  <Space><Segmented value={stream} options={["stdout","stderr"]} onChange={value => setStream(value as "stdout" | "stderr")} /><Button onClick={() => setRevision(value => value + 1)} loading={loading}>{t("webapps.refresh")}</Button></Space>
  {error && <Alert type="error" message={error} />}
  {loading ? <Spin /> : text ? <Typography.Paragraph><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:420,overflow:"auto"}}>{text}</pre></Typography.Paragraph> : <Empty />}
 </Space>;
}
