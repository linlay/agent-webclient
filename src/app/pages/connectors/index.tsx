import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ConnectorsConsole } from "@/features/connectors/components/ConnectorsConsole";
import { connectorsRoutePath } from "@/features/connectors/lib/connectorCatalog";

export function ConnectorsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ connectorId?: string; serverKey?: string }>();
  return <main className="automations-page connectors-page">
    <ConnectorsConsole routeId={String(params.connectorId || params.serverKey || "").trim()} onRouteIdChange={id => navigate(connectorsRoutePath(id, location.search))} />
  </main>;
}
