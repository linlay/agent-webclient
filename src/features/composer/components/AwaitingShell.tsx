import React from "react";

interface AwaitingShellProps {
  accessControls?: React.ReactNode;
  children: React.ReactNode;
}

export const AwaitingShell: React.FC<AwaitingShellProps> = ({
  accessControls,
  children,
}) => (
  <div className="composer-awaiting-shell">
    {accessControls}
    {children}
  </div>
);
