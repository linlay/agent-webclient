import React from "react";

interface AwaitingShellProps {
  children: React.ReactNode;
}

export const AwaitingShell: React.FC<AwaitingShellProps> = ({ children }) => (
  <div className="composer-awaiting-shell">
    {children}
  </div>
);
