import React from "react";
import { useLocation } from "react-router-dom";
import { GatewayLoginScreen } from "@/features/auth/components/GatewayLoginScreen";
import { sanitizeRelativeReturnTo } from "@/features/auth/lib/loginRoute";

export const LoginPage: React.FC = () => {
  const location = useLocation();
  const returnTo = React.useMemo(
    () => sanitizeRelativeReturnTo(new URLSearchParams(location.search).get("return_to") || "/"),
    [location.search],
  );
  return <GatewayLoginScreen returnTo={returnTo} />;
};
