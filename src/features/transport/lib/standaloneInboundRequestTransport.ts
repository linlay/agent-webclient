import type {
  InboundRequestHandler,
  InboundRequestTransport,
} from "@/features/transport/contracts/realtimeTransport";
import { ensureStandaloneWsClient } from "@/features/transport/lib/standaloneWsClient";

export class StandaloneInboundRequestTransport
  implements InboundRequestTransport
{
  register(type: string, handler: InboundRequestHandler): () => void {
    let active = true;
    let unregister: (() => void) | null = null;
    void ensureStandaloneWsClient()
      .then(async (client) => {
        if (!active) return;
        unregister = client.registerInboundRequestHandler(type, handler);
        await client.connect();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unregister?.();
      unregister = null;
    };
  }
}
