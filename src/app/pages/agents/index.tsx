import { useClientNavigate } from "@/shared/ui/useClientNavigate";
import { useLocation, useParams } from "react-router-dom";
import { isMobilePath } from "@/shared/utils/mobileRoutes";
import { AgentConsole } from "@/features/agents/components/AgentConsole";

export const AgentsPage = () => {
  const navigate = useClientNavigate();
  const location = useLocation();
  const params = useParams<{ agentKey?: string }>();
  const selectedAgentKey = String(params.agentKey || "").trim();
  const routeSearch = location.search || "";
  const mobile = isMobilePath(location.pathname);

  return (
    <main className="agents-page">
      <AgentConsole
        mobile={mobile}
        selectedAgentKey={selectedAgentKey}
        onSelectAgentKey={(agentKey) => {
          navigate(`/agents/${encodeURIComponent(agentKey)}${routeSearch}`);
        }}
        onClearSelection={() => navigate(`/agents${routeSearch}`)}
      />
    </main>
  );
};
