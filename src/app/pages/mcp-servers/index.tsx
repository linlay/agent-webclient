import { McpServersConsole } from "@/features/registries/components/McpServersConsole";
import { mcpServersRoutePath } from "@/features/registries/lib/mcpRoute";
import { useLocation, useNavigate, useParams } from "react-router-dom";

export const McpServersPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ serverKey?: string }>();
  const routeServerKey = String(params.serverKey || "").trim();

  return (
    <main className="automations-page mcp-servers-page">
      <McpServersConsole
        routeServerKey={routeServerKey}
        onRouteServerKeyChange={(serverKey) =>
          navigate(mcpServersRoutePath(serverKey, location.search || ""))
        }
      />
    </main>
  );
};
