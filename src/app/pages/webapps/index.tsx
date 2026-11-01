import { Navigate, useLocation } from "react-router-dom";
import { WebappsConsole } from "@/features/webapps/components/WebappsConsole";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { isPlatformBackendMode } from "@/shared/config/backendMode";

export function WebappsPage() {
  const location = useLocation();
  if (isDesktopAppMode() || !isPlatformBackendMode()) return <Navigate to="/" replace />;
  return <main><WebappsConsole initialId={new URLSearchParams(location.search).get("open") || ""} /></main>;
}
