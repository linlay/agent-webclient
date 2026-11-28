import { useLocation } from "react-router-dom";
import { AutomationsRouteContent } from "@/features/automations/components/AutomationsRouteContent";
import { isMobilePath } from "@/shared/utils/mobileRoutes";

export const AutomationsPage = () => {
  const location = useLocation();
  return (
    <main className="automations-page automations-console-page">
      <AutomationsRouteContent mobile={isMobilePath(location.pathname)} />
    </main>
  );
};
