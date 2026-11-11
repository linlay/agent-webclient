import { isGatewayBackendMode } from "./backendMode";
import { isEmbedMode } from "./embed";

/** Public iframe authorization is always Bearer, independent of transport routing. */
export function usesGatewaySession(): boolean { return isGatewayBackendMode() && !isEmbedMode(); }
