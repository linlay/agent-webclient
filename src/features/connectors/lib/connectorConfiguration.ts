import { openDesktopConnectorConfiguration } from "@/shared/data/desktop/desktopConnectorConfiguration";
import { isDesktopAppMode } from "@/shared/utils/routing";

export async function openConnectorConfiguration(connectorId: string, navigate: (path: string) => void): Promise<void> {
  if (isDesktopAppMode()) {
    // A denied or missing bridge leaves this guest at its current location.
    await openDesktopConnectorConfiguration(connectorId);
    return;
  }
  navigate(`/connectors/${encodeURIComponent(connectorId)}`);
}
