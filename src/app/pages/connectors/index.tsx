import { useClientNavigate } from "@/shared/ui/useClientNavigate";
import { useLocation, useParams } from "react-router-dom";
import { ConnectorsConsole } from "@/features/connectors/components/ConnectorsConsole";
import { connectorsRoutePath } from "@/features/connectors/lib/connectorCatalog";
import { isMobilePath } from "@/shared/utils/mobileRoutes";

export function ConnectorsPage() {
  const location = useLocation();
  const navigate = useClientNavigate();
  const params = useParams<{ connectorId?: string; serverKey?: string }>();
  return <main className="automations-page connectors-page tw:p-0">
    <ConnectorsConsole
      routeId={String(params.connectorId || params.serverKey || "").trim()}
      onRouteIdChange={id => navigate(connectorsRoutePath(id, location.search))}
      mobile={isMobilePath(location.pathname)}
    />
  </main>;
}
