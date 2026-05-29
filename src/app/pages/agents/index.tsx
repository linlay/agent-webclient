import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AgentConsole } from "@/features/workers/components/AgentConsole";

export const AgentsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ agentKey?: string }>();
  const selectedAgentKey = String(params.agentKey || "").trim();
  const routeSearch = location.search || "";

  return (
    <main className="agents-page">
      <AgentConsole
        selectedAgentKey={selectedAgentKey}
        onSelectAgentKey={(agentKey) => {
          navigate(`/agents/${encodeURIComponent(agentKey)}${routeSearch}`);
        }}
        onClearSelection={() => navigate(`/agents${routeSearch}`)}
      />
    </main>
  );
};
