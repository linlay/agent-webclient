import { useParams, useSearchParams } from "react-router-dom";
import { ViewViewerSurface } from "@/features/conversation/components/ViewViewerSurface";

export function ViewViewerPage() {
  const { sourceId = "" } = useParams();
  const [params] = useSearchParams();
  return <ViewViewerSurface address={{ chatId: params.get("chatId") || "", runId: params.get("runId") || "",
    sourceId, viewIndex: params.get("viewIndex") || "" }} />;
}
