/** Confirmation belongs to an unchanged editing scope. The exact destination
 * is granted only when the business operation has finished successfully. */
export interface ConnectorNavigationApproval {
  permit: (target: string) => (() => void) | null;
}

export function connectorNavigationPath(location: { pathname: string; search?: string; hash?: string }): string {
  return `${location.pathname}${location.search || ""}${location.hash || ""}`;
}
