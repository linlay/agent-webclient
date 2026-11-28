import { RegistryConsole } from "@/features/registries/components/RegistryConsole";
import { useLocation } from "react-router-dom";
import { isMobilePath } from "@/shared/utils/mobileRoutes";

export const RegistriesPage = () => {
  const location = useLocation();
  return (
    <main className="automations-page registries-page">
      <RegistryConsole mobile={isMobilePath(location.pathname)} />
    </main>
  );
};
