/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getConnectors } from "@/shared/data";
import { useConnectorPickerCatalog } from "./useConnectorPickerCatalog";

jest.mock("@/shared/data", () => ({ getConnectors: jest.fn() }));
const mockListeners = new Set<(status: string) => void>();
const mockPush = { subscribe: jest.fn(() => jest.fn()) };
const mockTransport = {
  getStatus: () => "connecting",
  subscribeStatus: (listener: (status: string) => void) => { mockListeners.add(listener); return () => mockListeners.delete(listener); },
};
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({
  usePushTransport: () => mockPush,
  useOptionalRealtimeTransport: () => mockTransport,
}));
let root: Root;
let catalog: ReturnType<typeof useConnectorPickerCatalog>;
function ComposerCatalog({ agentKey }: { agentKey: string }) {
  catalog = useConnectorPickerCatalog(agentKey);
  return React.createElement("span", null, catalog.items.map(item => item.id).join(","));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.clearAllMocks();
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); });

it("loads three connectors on entering chat without opening the plus menu", async () => {
  jest.mocked(getConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: ["a", "b", "c"].map(id => ({ id, name: id })) } });
  await act(async () => root.render(React.createElement(ComposerCatalog, { agentKey: "demo" })));
  expect(catalog.items.map(item => item.id)).toEqual(["a", "b", "c"]);
  expect(getConnectors).toHaveBeenCalledWith("demo");
});

it("recovers an initial Desktop catalog failure when the transport reconnects", async () => {
  jest.mocked(getConnectors).mockRejectedValueOnce(new Error("Desktop Session retired"));
  await act(async () => root.render(React.createElement(ComposerCatalog, { agentKey: "demo" })));
  expect(catalog.items).toEqual([]);
  expect(catalog.error).toBeTruthy();
  jest.mocked(getConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: ["a", "b", "c"].map(id => ({ id, name: id })) } });
  await act(async () => {
    mockListeners.forEach(listener => listener("disconnected"));
    mockListeners.forEach(listener => listener("connected"));
  });
  expect(catalog.items.map(item => item.id)).toEqual(["a", "b", "c"]);
  expect(catalog.error).toBeNull();
  expect(getConnectors).toHaveBeenCalledTimes(2);
});
