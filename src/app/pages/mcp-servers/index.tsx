import { McpServersConsole } from "@/features/registries/components/McpServersConsole";
import { useLocation, useNavigate, useParams } from "react-router-dom";

export function mcpServersRoutePath(serverKey: string, search = ""): string {
  const normalizedKey = serverKey.trim();
  const normalizedSearch = search
    ? search.startsWith("?")
      ? search
      : `?${search}`
    : "";
  return normalizedKey
    ? `/mcp-servers/${encodeURIComponent(normalizedKey)}${normalizedSearch}`
    : `/mcp-servers${normalizedSearch}`;
}

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
