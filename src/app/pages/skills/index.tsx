import { useLocation, useNavigate, useParams } from "react-router-dom";
import { SkillConsole } from "@/features/skills/components/SkillConsole";

export const SkillsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ skillKey?: string }>();
  const selectedSkillKey = String(params.skillKey || "").trim();
  const routeSearch = location.search || "";

  return (
    <main className="skills-page">
      <SkillConsole
        selectedSkillKey={selectedSkillKey}
        onSelectSkillKey={(skillKey) => {
          navigate(`/skills/${encodeURIComponent(skillKey)}${routeSearch}`);
        }}
        onClearSelection={() => navigate(`/skills${routeSearch}`)}
      />
    </main>
  );
};
