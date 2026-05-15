import { useNavigate, useParams } from "react-router-dom";
import { AgentConsole } from "@/features/workers/components/AgentConsole";

export const AgentsPage = () => {
  const navigate = useNavigate();
  const params = useParams<{ agentKey?: string }>();
  const selectedAgentKey = String(params.agentKey || "").trim();

  return (
    <main className="agents-page">
      <AgentConsole
        selectedAgentKey={selectedAgentKey}
        onSelectAgentKey={(agentKey) => {
          navigate(`/agents/${encodeURIComponent(agentKey)}`);
        }}
        onClearSelection={() => navigate("/agents")}
      />
    </main>
  );
};
