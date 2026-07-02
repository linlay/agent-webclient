import type { AgentEvent } from "@/app/state/types";
import {
  getWsClient,
  initWsClient,
  updateCurrentWsClientOptions,
} from "@/features/transport/lib/wsClientSingleton";
import {
  type WsAccessTokenRefreshReason,
  type WsClient,
} from "@/features/transport/lib/wsClient";
import {
  dataEndpoints,
  ensureAccessToken,
  getCurrentAccessToken,
} from "@/shared/data";

export type TerminalOpenOptions = {
  readonly agentKey: string;
  readonly terminalKey: string;
  readonly cols: number;
  readonly rows: number;
  readonly onEvent: (event: AgentEvent) => void;
  readonly onDone?: (reason: string, lastSeq: number) => void;
  readonly onError?: (error: Error) => void;
};

export type TerminalStreamHandle = {
  readonly requestId: string;
  readonly abort: () => void;
};

export type TerminalStatusOptions = {
  readonly onEvent: (event: AgentEvent) => void;
  readonly onDone?: (reason: string, lastSeq: number) => void;
  readonly onError?: (error: Error) => void;
};

export type TerminalInputPayload = {
  readonly terminalId: string;
  readonly data: string;
};

export type TerminalResizePayload = {
  readonly terminalId: string;
  readonly cols: number;
  readonly rows: number;
};

export type TerminalDetachPayload = {
  readonly terminalId?: string;
  readonly streamRequestId: string;
};

async function resolveTerminalAccessToken(
  reason: WsAccessTokenRefreshReason = "missing",
): Promise<string> {
  const token = String((await ensureAccessToken(reason)) || "").trim();
  return token || String(getCurrentAccessToken() || "").trim();
}

export async function resolveTerminalWsClient(): Promise<WsClient> {
  let accessToken = String(getCurrentAccessToken() || "").trim();
  if (!accessToken) {
    accessToken = await resolveTerminalAccessToken("missing");
  }

  const options = {
    accessToken,
    resolveAccessToken: resolveTerminalAccessToken,
  };
  const current = getWsClient();
  if (current) {
    return updateCurrentWsClientOptions(options) || current;
  }
  return initWsClient(options);
}

export function openTerminalStream(
  client: WsClient,
  options: TerminalOpenOptions,
): TerminalStreamHandle {
  return client.stream({
    type: dataEndpoints.terminalOpen.path,
    payload: {
      agentKey: options.agentKey,
      terminalKey: options.terminalKey,
      cols: Math.max(1, options.cols),
      rows: Math.max(1, options.rows),
    },
    onEvent: options.onEvent,
    onDone: options.onDone,
    onError: options.onError,
  });
}

export function openTerminalStatusStream(
  client: WsClient,
  options: TerminalStatusOptions,
): TerminalStreamHandle {
  return client.stream({
    type: dataEndpoints.terminalStatus.path,
    payload: {},
    onEvent: options.onEvent,
    onDone: options.onDone,
    onError: options.onError,
  });
}

export function sendTerminalInput(
  client: WsClient,
  payload: TerminalInputPayload,
): Promise<unknown> {
  return client.request({
    type: dataEndpoints.terminalInput.path,
    payload,
  });
}

export function sendTerminalResize(
  client: WsClient,
  payload: TerminalResizePayload,
): Promise<unknown> {
  return client.request({
    type: dataEndpoints.terminalResize.path,
    payload,
  });
}

export function sendTerminalDetach(
  client: WsClient,
  payload: TerminalDetachPayload,
): Promise<unknown> {
  return client.request({
    type: dataEndpoints.terminalDetach.path,
    payload,
  });
}

export function sendTerminalStatusDetach(
  client: WsClient,
  payload: { readonly streamRequestId: string },
): Promise<unknown> {
  return client.request({
    type: dataEndpoints.terminalStatusDetach.path,
    payload,
  });
}

export function sendTerminalClose(
  client: WsClient,
  payload: { readonly terminalId?: string; readonly streamRequestId?: string },
): Promise<unknown> {
  return client.request({
    type: dataEndpoints.terminalClose.path,
    payload,
  });
}
