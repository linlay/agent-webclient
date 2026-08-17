import {
  useOptionalRealtimeTransport,
  useRealtimeTransport,
} from "@/features/transport/components/RealtimeTransportProvider";

export function useRunTransport() {
  return useRealtimeTransport().runs;
}

export function usePushTransport() {
  return useRealtimeTransport().push;
}

export function useInboundRequestTransport() {
  return useRealtimeTransport().inbound;
}

export function useTerminalTransport() {
  return useRealtimeTransport().terminal;
}

export function useOptionalTerminalTransport() {
  return useOptionalRealtimeTransport()?.terminal ?? null;
}

export { useOptionalRealtimeTransport, useRealtimeTransport };
