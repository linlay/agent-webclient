/** @jest-environment jsdom */

import { TextDecoder, TextEncoder } from "node:util";
Object.assign(globalThis, { TextEncoder, TextDecoder });

import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";
import {
  TERMINAL_ACK_BATCH_BYTES,
  TERMINAL_WS_OP,
  TERMINAL_WS_PROTOCOL_VERSION,
  TerminalSocketTransport,
} from "./terminalSocketTransport";

class MockBinaryWebSocket {
  static instances: MockBinaryWebSocket[] = [];
  readonly url: string;
  readonly protocols: string | string[] | undefined;
  readonly sentFrames: Uint8Array[] = [];
  binaryType: BinaryType = "blob";
  readyState = 0; // CONNECTING
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  closeCalls = 0;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockBinaryWebSocket.instances.push(this);
  }

  send(data: ArrayBuffer | ArrayBufferView | string) {
    if (typeof data === "string") {
      throw new Error("expected binary WebSocket frame");
    }
    const bytes = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.sentFrames.push(bytes.slice());
  }

  close(code?: number, reason?: string) {
    this.closeCalls += 1;
    this.readyState = 3;
    this.onclose?.({ code: code ?? 1000, reason: reason ?? "", wasClean: true } as CloseEvent);
  }

  emitOpen() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  emitServerFrame(opcode: number, payload: Uint8Array | Record<string, unknown>) {
    const body = payload instanceof Uint8Array
      ? payload
      : new TextEncoder().encode(JSON.stringify(payload));
    const frame = new Uint8Array(1 + body.length);
    frame[0] = opcode;
    frame.set(body, 1);
    this.onmessage?.({ data: frame.buffer } as MessageEvent);
  }

  emitAbnormalClose(code = 1006, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: false } as CloseEvent);
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }
}

function decodeOpenFrame(frame: Uint8Array): Record<string, unknown> {
  expect(frame[0]).toBe(TERMINAL_WS_OP.OPEN);
  return JSON.parse(new TextDecoder().decode(frame.slice(1))) as Record<string, unknown>;
}

describe("TerminalSocketTransport", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    MockBinaryWebSocket.instances.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("connects to same-origin /api/terminal/ws without query string, sends subprotocol token in standalone mode and omits it in desktop mode", async () => {
    const standalone = new TerminalSocketTransport({
      resolveAccessToken: async () => "jwt-token-1",
      getDeviceId: () => "dev-123",
      webSocketFactory: (url, protocols) => new MockBinaryWebSocket(url, protocols) as unknown as WebSocket,
    });

    const exec1 = standalone.open({
      agentKey: "coder",
      terminalKey: "main",
      cols: 100,
      rows: 30,
      onEvent: jest.fn(),
    });
    await Promise.resolve();

    expect(MockBinaryWebSocket.instances).toHaveLength(1);
    const ws1 = MockBinaryWebSocket.instances[0];
    const parsed1 = new URL(ws1.url);
    expect(parsed1.pathname).toBe("/api/terminal/ws");
    expect(parsed1.search).toBe("");
    expect(ws1.protocols).toEqual(["bearer.jwt-token-1"]);

    ws1.emitOpen();
    expect(ws1.sentFrames).toHaveLength(1);
    expect(decodeOpenFrame(ws1.sentFrames[0])).toEqual({
      protocolVersion: TERMINAL_WS_PROTOCOL_VERSION,
      agentKey: "coder",
      terminalKey: "main",
      cols: 100,
      rows: 30,
      deviceId: "dev-123",
    });

    ws1.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.opened",
      protocolVersion: 1,
      terminalId: "term-1",
      agentKey: "coder",
      terminalKey: "main",
    });
    await expect(exec1.accepted).resolves.toMatchObject({ terminalId: "term-1" });
    await exec1.detach();

    const desktop = new TerminalSocketTransport({
      webSocketFactory: (url, protocols) => new MockBinaryWebSocket(url, protocols) as unknown as WebSocket,
    });
    const exec2 = desktop.open({
      agentKey: "coder",
      terminalKey: "tab-2",
      cols: 80,
      rows: 24,
      onEvent: jest.fn(),
    });
    await Promise.resolve();

    const ws2 = MockBinaryWebSocket.instances[1];
    expect(new URL(ws2.url).search).toBe("");
    expect(ws2.protocols).toBeUndefined();
    ws2.emitOpen();
    expect(decodeOpenFrame(ws2.sentFrames[0])).toEqual({
      protocolVersion: TERMINAL_WS_PROTOCOL_VERSION,
      agentKey: "coder",
      terminalKey: "tab-2",
      cols: 80,
      rows: 24,
    });
    ws2.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.opened",
      terminalId: "term-2",
      agentKey: "coder",
      terminalKey: "tab-2",
    });
    await exec2.accepted;
    const closeExec2 = exec2.close();
    ws2.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.exit",
      terminalId: "term-2",
      agentKey: "coder",
      terminalKey: "tab-2",
      reason: "closed",
    });
    await closeExec2;
  });

  it("encodes INPUT, RESIZE, DETACH, CLOSE frames and passes raw Uint8Array to onOutput with 64 KiB batched ACK", async () => {
    const transport = new TerminalSocketTransport({
      webSocketFactory: (url, protocols) => new MockBinaryWebSocket(url, protocols) as unknown as WebSocket,
    });
    const onOutput = jest.fn<void, [Uint8Array, () => void]>();
    const onEvent = jest.fn<void, [AgentEvent]>();
    const exec = transport.open({
      agentKey: "coder",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent,
      onOutput,
    });
    await Promise.resolve();

    const ws = MockBinaryWebSocket.instances[0];
    ws.emitOpen();
    ws.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.opened",
      terminalId: "term-bin",
      agentKey: "coder",
      terminalKey: "main",
    });
    await exec.accepted;

    // Input encoding: 0x02 + UTF-8 bytes
    await exec.write("ls 中文\n");
    const inputFrame = ws.sentFrames[1];
    expect(inputFrame[0]).toBe(TERMINAL_WS_OP.INPUT);
    expect(new TextDecoder().decode(inputFrame.slice(1))).toBe("ls 中文\n");

    // Resize encoding: 0x03 + uint16BE(cols) + uint16BE(rows)
    await exec.resize(132, 43);
    const resizeFrame = ws.sentFrames[2];
    expect(resizeFrame).toHaveLength(5);
    expect(resizeFrame[0]).toBe(TERMINAL_WS_OP.RESIZE);
    const resizeView = new DataView(resizeFrame.buffer, resizeFrame.byteOffset, resizeFrame.byteLength);
    expect(resizeView.getUint16(1, false)).toBe(132);
    expect(resizeView.getUint16(3, false)).toBe(43);

    // Output passes raw Uint8Array to onOutput; ACK sent only once onWritten reaches 64 KiB.
    const chunk1 = new Uint8Array(40 * 1024).fill(0x41);
    const chunk2 = new Uint8Array(30 * 1024).fill(0x42);
    ws.emitServerFrame(TERMINAL_WS_OP.OUTPUT, chunk1);
    ws.emitServerFrame(TERMINAL_WS_OP.OUTPUT, chunk2);

    expect(onOutput).toHaveBeenCalledTimes(2);
    expect(onOutput.mock.calls[0][0]).toEqual(chunk1);
    expect(onOutput.mock.calls[1][0]).toEqual(chunk2);
    // Neither write callback called yet -> no ACK sent.
    expect(ws.sentFrames.filter((f) => f[0] === TERMINAL_WS_OP.ACK)).toHaveLength(0);

    // Invoke first write callback (40 KiB < 64 KiB) -> still no ACK.
    onOutput.mock.calls[0][1]();
    expect(ws.sentFrames.filter((f) => f[0] === TERMINAL_WS_OP.ACK)).toHaveLength(0);

    // Invoke second write callback (40 + 30 = 70 KiB >= 64 KiB) -> sends ACK(70 KiB).
    onOutput.mock.calls[1][1]();
    const ackFrames = ws.sentFrames.filter((f) => f[0] === TERMINAL_WS_OP.ACK);
    expect(ackFrames).toHaveLength(1);
    expect(ackFrames[0]).toHaveLength(5);
    const ackView = new DataView(ackFrames[0].buffer, ackFrames[0].byteOffset, ackFrames[0].byteLength);
    expect(ackView.getUint32(1, false)).toBe(70 * 1024);
    expect(TERMINAL_ACK_BATCH_BYTES).toBe(64 * 1024);

    const closeExec = exec.close();
    expect(ws.sentFrames[ws.sentFrames.length - 1]).toEqual(Uint8Array.from([TERMINAL_WS_OP.CLOSE]));
    ws.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.exit",
      terminalId: "term-bin",
      agentKey: "coder",
      terminalKey: "main",
      reason: "closed",
    });
    await closeExec;
  });

  it("reconnects with exponential backoff 0.5s -> 8s after abnormal close and does not reconnect after terminal exit, detach, or close", async () => {
    const transport = new TerminalSocketTransport({
      webSocketFactory: (url, protocols) => new MockBinaryWebSocket(url, protocols) as unknown as WebSocket,
    });
    const onEvent = jest.fn();
    const exec = transport.open({
      agentKey: "coder",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent,
    });
    await Promise.resolve();

    const ws1 = MockBinaryWebSocket.instances[0];
    ws1.emitOpen();
    ws1.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.opened",
      terminalId: "term-r",
      agentKey: "coder",
      terminalKey: "main",
    });
    await exec.accepted;
    await exec.resize(120, 40);

    // 1st abnormal close -> 500ms
    ws1.emitAbnormalClose();
    await jest.advanceTimersByTimeAsync(499);
    expect(MockBinaryWebSocket.instances).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(MockBinaryWebSocket.instances).toHaveLength(2);

    // 2nd abnormal close before open/acceptance on reconnect -> 1000ms, 2000ms, 4000ms, 8000ms, 8000ms
    MockBinaryWebSocket.instances[1].emitOpen();
    MockBinaryWebSocket.instances[1].emitAbnormalClose();
    await jest.advanceTimersByTimeAsync(999);
    expect(MockBinaryWebSocket.instances).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(MockBinaryWebSocket.instances).toHaveLength(3);

    MockBinaryWebSocket.instances[2].emitOpen();
    MockBinaryWebSocket.instances[2].emitAbnormalClose();
    await jest.advanceTimersByTimeAsync(2000);
    expect(MockBinaryWebSocket.instances).toHaveLength(4);

    MockBinaryWebSocket.instances[3].emitOpen();
    MockBinaryWebSocket.instances[3].emitAbnormalClose();
    await jest.advanceTimersByTimeAsync(4000);
    expect(MockBinaryWebSocket.instances).toHaveLength(5);

    MockBinaryWebSocket.instances[4].emitOpen();
    MockBinaryWebSocket.instances[4].emitAbnormalClose();
    await jest.advanceTimersByTimeAsync(8000);
    expect(MockBinaryWebSocket.instances).toHaveLength(6);

    MockBinaryWebSocket.instances[5].emitOpen();
    MockBinaryWebSocket.instances[5].emitAbnormalClose();
    await jest.advanceTimersByTimeAsync(8000);
    expect(MockBinaryWebSocket.instances).toHaveLength(7);

    // Connected & re-opened with latest cols/rows resets backoff.
    const ws7 = MockBinaryWebSocket.instances[6];
    ws7.emitOpen();
    expect(decodeOpenFrame(ws7.sentFrames[0])).toMatchObject({ cols: 120, rows: 40 });
    ws7.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.opened",
      terminalId: "term-r",
      agentKey: "coder",
      terminalKey: "main",
    });

    // Terminal exit stops reconnects cleanly.
    ws7.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.exit",
      terminalId: "term-r",
      exitCode: 0,
    });
    ws7.emitAbnormalClose();
    await jest.advanceTimersByTimeAsync(20_000);
    expect(MockBinaryWebSocket.instances).toHaveLength(7);
    await expect(exec.completion).resolves.toMatchObject({ reason: "exit" });
  });

  it("reports actionable errors on 426 version mismatch and handshake failure without reconnecting", async () => {
    const transport = new TerminalSocketTransport({
      webSocketFactory: (url, protocols) => new MockBinaryWebSocket(url, protocols) as unknown as WebSocket,
    });

    const exec426 = transport.open({
      agentKey: "coder",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent: jest.fn(),
    });
    await Promise.resolve();
    const ws1 = MockBinaryWebSocket.instances[0];
    ws1.emitOpen();
    ws1.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.error",
      code: "protocol_version_mismatch",
      status: 426,
      message: "unsupported terminal protocol version",
      serverVersion: 2,
    });
    ws1.close();

    await expect(exec426.accepted).rejects.toMatchObject({
      name: "RealtimeTransportError",
      code: "protocol_version_mismatch",
    });
    const acceptedErr = await exec426.accepted.catch((err) => err);
    expect(acceptedErr).toBeInstanceOf(RealtimeTransportError);
    expect(acceptedErr.message).toMatch(/426|protocol|upgrade|version/i);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(MockBinaryWebSocket.instances).toHaveLength(1);

    const execHandshake = transport.open({
      agentKey: "coder",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent: jest.fn(),
    });
    await Promise.resolve();
    const ws2 = MockBinaryWebSocket.instances[1];
    ws2.emitError();
    ws2.emitAbnormalClose();

    const handshakeErr = await execHandshake.accepted.catch((err) => err);
    expect(handshakeErr).toBeInstanceOf(RealtimeTransportError);
    expect(handshakeErr.code).toBe("terminal_ws_handshake_failed");
    expect(handshakeErr.message).toContain("/api/terminal/ws");
    await jest.advanceTimersByTimeAsync(10_000);
    expect(MockBinaryWebSocket.instances).toHaveLength(2);
  });

  it("sends OPEN.cwd only on initial open and forwards shell.* events", async () => {
    const onEvent = jest.fn();
    const transport = new TerminalSocketTransport({
      webSocketFactory: (url, protocols) => new MockBinaryWebSocket(url, protocols) as unknown as WebSocket,
    });

    const exec = transport.open({
      agentKey: "coder",
      terminalKey: "tab-cwd",
      cwd: "/repo/sub",
      cols: 90,
      rows: 30,
      onEvent,
    });
    await Promise.resolve();

    const ws1 = MockBinaryWebSocket.instances[0];
    ws1.emitOpen();
    expect(decodeOpenFrame(ws1.sentFrames[0])).toMatchObject({
      agentKey: "coder",
      terminalKey: "tab-cwd",
      cwd: "/repo/sub",
    });

    ws1.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.opened",
      terminalId: "term-cwd",
      agentKey: "coder",
      terminalKey: "tab-cwd",
      cwd: "/repo/sub",
    });
    await exec.accepted;

    const shellCwd = { type: "shell.cwd", terminalId: "term-cwd", cwd: "/repo/sub/deep" };
    const shellEnd = { type: "shell.command.end", terminalId: "term-cwd", command: "ls", exitCode: 2 };
    ws1.emitServerFrame(TERMINAL_WS_OP.EVENT, shellCwd);
    ws1.emitServerFrame(TERMINAL_WS_OP.EVENT, shellEnd);
    expect(onEvent).toHaveBeenCalledWith(shellCwd);
    expect(onEvent).toHaveBeenCalledWith(shellEnd);

    // Reconnect after abnormal close must not resend OPEN.cwd
    ws1.emitAbnormalClose();
    await jest.advanceTimersByTimeAsync(500);
    const ws2 = MockBinaryWebSocket.instances[1];
    ws2.emitOpen();
    const reconnectOpen = decodeOpenFrame(ws2.sentFrames[0]);
    expect(reconnectOpen.cwd).toBeUndefined();
  });

  it("sends OPEN.profile on initial connect only and not on reconnect", async () => {
    const transport = new TerminalSocketTransport({
      webSocketFactory: (url, protocols) => new MockBinaryWebSocket(url, protocols) as unknown as WebSocket,
    });
    const exec = transport.open({
      agentKey: "coder",
      terminalKey: "tab-wsl",
      profile: "wsl",
      cols: 80,
      rows: 24,
      onEvent: () => undefined,
    });
    await Promise.resolve();

    const ws1 = MockBinaryWebSocket.instances[0];
    ws1.emitOpen();
    expect(decodeOpenFrame(ws1.sentFrames[0])).toMatchObject({
      agentKey: "coder",
      terminalKey: "tab-wsl",
      profile: "wsl",
    });

    ws1.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.opened",
      terminalId: "term-wsl",
      agentKey: "coder",
      terminalKey: "tab-wsl",
      cwd: "/repo",
    });
    await exec.accepted;

    ws1.emitAbnormalClose();
    await jest.advanceTimersByTimeAsync(500);
    const ws2 = MockBinaryWebSocket.instances[1];
    ws2.emitOpen();
    const reconnectOpen = decodeOpenFrame(ws2.sentFrames[0]);
    expect(reconnectOpen.profile).toBeUndefined();
  });

  it("waits for server close acknowledgement before resolving close() without forwarding stale terminal.exit", async () => {
    const onEvent = jest.fn<void, [AgentEvent]>();
    const transport = new TerminalSocketTransport({
      webSocketFactory: (url, protocols) => new MockBinaryWebSocket(url, protocols) as unknown as WebSocket,
    });
    const exec = transport.open({
      agentKey: "coder",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent,
    });
    await Promise.resolve();

    const ws = MockBinaryWebSocket.instances[0];
    ws.emitOpen();
    ws.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.opened",
      terminalId: "term-close-ack",
      agentKey: "coder",
      terminalKey: "main",
    });
    await exec.accepted;
    onEvent.mockClear();

    let settled = false;
    const closePromise = exec.close().then(() => {
      settled = true;
    });

    expect(ws.sentFrames[ws.sentFrames.length - 1]).toEqual(Uint8Array.from([TERMINAL_WS_OP.CLOSE]));
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(ws.closeCalls).toBe(0);

    ws.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.exit",
      terminalId: "term-close-ack",
      exitCode: 1,
      reason: "closed",
    });

    await closePromise;
    expect(settled).toBe(true);
    expect(onEvent).not.toHaveBeenCalled();
    await expect(exec.completion).resolves.toEqual({ reason: "closed", lastSeq: 0 });
  });

  it("resolves close() and force-closes socket after timeout when server does not reply", async () => {
    const transport = new TerminalSocketTransport({
      closeAckTimeoutMs: 1500,
      webSocketFactory: (url, protocols) => new MockBinaryWebSocket(url, protocols) as unknown as WebSocket,
    });
    const exec = transport.open({
      agentKey: "coder",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent: () => undefined,
    });
    await Promise.resolve();

    const ws = MockBinaryWebSocket.instances[0];
    ws.emitOpen();
    ws.emitServerFrame(TERMINAL_WS_OP.EVENT, {
      type: "terminal.opened",
      terminalId: "term-close-timeout",
      agentKey: "coder",
      terminalKey: "main",
    });
    await exec.accepted;

    let settled = false;
    const closePromise = exec.close().then(() => {
      settled = true;
    });

    await jest.advanceTimersByTimeAsync(1499);
    expect(settled).toBe(false);
    expect(ws.closeCalls).toBe(0);

    await jest.advanceTimersByTimeAsync(1);
    await closePromise;
    expect(settled).toBe(true);
    expect(ws.closeCalls).toBe(1);
    await expect(exec.completion).resolves.toEqual({ reason: "closed", lastSeq: 0 });
  });
});
