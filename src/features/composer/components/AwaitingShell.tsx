import React from "react";

interface AwaitingShellProps {
  children: React.ReactNode;
}

const COMPOSER_AWAITING_SHELL_CLASS =
  "composer-awaiting-shell tw:flex tw:w-full tw:flex-col tw:gap-2";

export const AwaitingShell: React.FC<AwaitingShellProps> = ({ children }) => (
  <div className={COMPOSER_AWAITING_SHELL_CLASS}>
    {children}
  </div>
);
