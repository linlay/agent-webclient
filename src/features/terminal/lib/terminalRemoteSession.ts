import type { AgentEvent } from "@/app/state/types";
import type { WsClient } from "@/features/transport/lib/wsClient";
import {
  openTerminalStream,
  sendTerminalClose,
  sendTerminalDetach,
  sendTerminalInput,
  sendTerminalResize,
} from "@/features/terminal/lib/terminalTransport";
import { toText } from "@/shared/utils/eventUtils";

export type TerminalRemoteSessionOptions = {
  readonly client: WsClient;
  readonly agentKey: string;
  readonly terminalKey: string;
  readonly cols: number;
  readonly rows: number;
  readonly onEvent: (event: AgentEvent) => void;
  readonly onDone?: (reason: string, lastSeq: number) => void;
  readonly onError?: (error: Error) => void;
};

export type TerminalRemoteSession = {
  readonly streamRequestId: string;
  readonly terminalKey: string;
  getTerminalId: () => string;
  sendInput: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  detach: () => Promise<void>;
  close: () => Promise<void>;
  abort: () => void;
};

export function createTerminalRemoteSession(
  options: TerminalRemoteSessionOptions,
): TerminalRemoteSession {
  let terminalId = "";
  let detached = false;
  let closed = false;
  let ended = false;

  const stream = openTerminalStream(options.client, {
    agentKey: options.agentKey,
    terminalKey: options.terminalKey,
    cols: options.cols,
    rows: options.rows,
    onEvent: (event) => {
      if (toText(event.type) === "terminal.opened") {
        terminalId = toText(event.terminalId);
      }
      options.onEvent(event);
    },
    onDone: (reason, lastSeq) => {
      ended = true;
      options.onDone?.(reason, lastSeq);
    },
    onError: (error) => {
      ended = true;
      options.onError?.(error);
    },
  });

  const detach = async (): Promise<void> => {
    if (detached || closed || ended) {
      return;
    }
    detached = true;
    const id = terminalId;
    try {
      await sendTerminalDetach(options.client, {
        ...(id ? { terminalId: id } : {}),
        streamRequestId: stream.requestId,
      });
    } finally {
      stream.abort();
    }
  };

  const close = async (): Promise<void> => {
    if (closed || ended) {
      return;
    }
    closed = true;
    const id = terminalId;
    try {
      if (id) {
        terminalId = "";
        await sendTerminalClose(options.client, {
          terminalId: id,
          streamRequestId: stream.requestId,
        });
      } else {
        await sendTerminalClose(options.client, {
          streamRequestId: stream.requestId,
        });
      }
    } finally {
      stream.abort();
    }
  };

  return {
    streamRequestId: stream.requestId,
    terminalKey: options.terminalKey,
    getTerminalId: () => terminalId,
    sendInput: async (data) => {
      const id = terminalId;
      if (!id || !data) {
        return;
      }
      await sendTerminalInput(options.client, {
        terminalId: id,
        data,
      });
    },
    resize: async (cols, rows) => {
      const id = terminalId;
      if (!id) {
        return;
      }
      await sendTerminalResize(options.client, {
        terminalId: id,
        cols: Math.max(1, cols),
        rows: Math.max(1, rows),
      });
    },
    detach,
    close,
    abort: stream.abort,
  };
}

export function terminalErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error || "terminal error");
}

export function reportTerminalTeardownError(error: unknown): void {
  if (error instanceof Error) {
    console.debug("terminal teardown failed", error.message);
    return;
  }
  console.debug("terminal teardown failed", String(error || "unknown error"));
}
