import { useLocation, useNavigate, useParams } from "react-router-dom";
import { SkillConsole } from "@/features/skills/components/SkillConsole";

export const SkillsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ skillId?: string }>();
  const selectedSkillId = String(params.skillId || "").trim();
  const routeSearch = location.search || "";

  return (
    <main className="skills-page">
      <SkillConsole
        selectedSkillId={selectedSkillId}
        onSelectSkillId={(skillId) => {
          navigate(`/skills/${encodeURIComponent(skillId)}${routeSearch}`);
        }}
        onClearSelection={() =>
          navigate(`/skills${routeSearch}`, { replace: true })
        }
      />
    </main>
  );
};
