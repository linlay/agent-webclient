import type {
  PlatformFrameClient,
  PlatformRequestOptions,
} from "@/features/transport/lib/platformFrameClient";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";

type RunClient = Pick<PlatformFrameClient, "stream" | "request">;

function explanationPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new RealtimeTransportError("invalid_request", "Explanation request requires an object payload");
  }
  // Desktop IPC validates and removes this routing metadata before forwarding to Platform.
  return { ...payload, _desktopTransportPurpose: "selection-explain" };
}

export function createDesktopSelectionExplainClient(client: RunClient): RunClient {
  return {
    stream: (options) => client.stream({ ...options, payload: explanationPayload(options.payload) }),
    request: <T>(options: PlatformRequestOptions) => client.request<T>({
      ...options, payload: explanationPayload(options.payload),
    }),
  };
}
