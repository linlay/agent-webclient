import React from "react";
import { useLocation } from "react-router-dom";
import { KBasesConsole } from "@/features/kbases/components/KBasesConsole";
import { isMobilePath } from "@/shared/utils/mobileRoutes";

export const KBasesPage = () => {
  const location = useLocation();
  return (
    <main>
      <KBasesConsole mobile={isMobilePath(location.pathname)} />
    </main>
  );
};
