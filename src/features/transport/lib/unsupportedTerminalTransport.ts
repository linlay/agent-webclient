import type {
  TerminalExecution,
  TerminalOpenInput,
  TerminalTransport,
} from "@/features/transport/contracts/realtimeTransport";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";

function unsupportedError(): RealtimeTransportError {
  return new RealtimeTransportError(
    "terminal_unsupported",
    "Desktop Platform Frame Port does not support terminal sessions",
  );
}

export class UnsupportedTerminalTransport implements TerminalTransport {
  open(_input: TerminalOpenInput): TerminalExecution {
    const error = unsupportedError();
    return {
      accepted: Promise.reject(error),
      completion: Promise.resolve({ reason: "unsupported", lastSeq: 0, error }),
      getTerminalId: () => "",
      write: async () => { throw unsupportedError(); },
      resize: async () => { throw unsupportedError(); },
      detach: async () => undefined,
      close: async () => undefined,
    };
  }

  subscribeStatus(): () => void {
    return () => undefined;
  }
}
