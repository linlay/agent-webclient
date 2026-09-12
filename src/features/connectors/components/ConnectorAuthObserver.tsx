import { useEffect } from "react";
import { ConnectorAuthBrowser } from "./ConnectorAuthBrowser";
import type { ConnectorSummary } from "@/shared/data";
import { useConnectorAuth, type ConnectorAuthRuntime } from "../hooks/useConnectorAuth";
import type { createConnectorAuthChecks } from "../lib/connectorAuthChecks";

export function connectorAuthIdentity(item: ConnectorSummary): string {
  return JSON.stringify([item.id, item.auth_mode, item.version, item.builtin === true || item.readOnly === true]);
}

// Observers belong to the catalog, so filtering, tabs, and selection don't reset
// the last known status or start duplicate detail requests.
export function ConnectorAuthObserver({ item, checks, onChange, onCredentialsChange }: {
  item: ConnectorSummary;
  checks: ReturnType<typeof createConnectorAuthChecks>;
  onChange: (identity: string, runtime: ConnectorAuthRuntime | null) => void;
  onCredentialsChange: () => void;
}) {
  const identity = connectorAuthIdentity(item);
  const auth = useConnectorAuth({ id: item.id, mode: item.auth_mode, readOnly: item.builtin === true || item.readOnly === true,
    checkStatus: checks.request, observe: true, onCredentialsChange });
  useEffect(() => { onChange(identity, auth); }, [identity, auth, onChange]);
  useEffect(() => () => onChange(identity, null), [identity, onChange]);
  return <ConnectorAuthBrowser auth={auth} />;
}
