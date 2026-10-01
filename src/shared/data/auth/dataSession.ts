import { getBackendMode } from "@/shared/config/backendMode";
import { getCurrentAccessToken } from "../api/routedClient";
import { getGatewaySession } from "./gatewaySession";
let identity = "";
let revision = 0;
/** Opaque revision: credentials never appear in cache keys. */
export function getDataSessionRevision() {
  const next = `${getBackendMode()}\0${getCurrentAccessToken()}\0${getGatewaySession()?.user?.subject || ""}`;
  if (next !== identity) { identity = next; revision++; }
  return revision;
}
