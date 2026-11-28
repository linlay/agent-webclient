import { useClientNavigate } from "@/shared/ui/useClientNavigate";
import { useLocation, useParams } from "react-router-dom";
import { isMobilePath } from "@/shared/utils/mobileRoutes";
import { SkillConsole } from "@/features/skills/components/SkillConsole";

export const SkillsPage = () => {
  const navigate = useClientNavigate();
  const location = useLocation();
  const params = useParams<{ skillId?: string }>();
  const selectedSkillId = String(params.skillId || "").trim();
  const routeSearch = location.search || "";
  const mobile = isMobilePath(location.pathname);

  return (
    <main className="skills-page">
      <SkillConsole
        mobile={mobile}
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
