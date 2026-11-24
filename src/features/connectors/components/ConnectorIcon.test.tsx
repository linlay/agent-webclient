/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fetchConnectorIcon } from "@/shared/data";
import { ConnectorIcon } from "./ConnectorIcon";

jest.mock("@/shared/data", () => ({ fetchConnectorIcon: jest.fn() }));

let root: Root;
let container: HTMLDivElement;
let originalRevokeObjectURL: typeof URL.revokeObjectURL;
const mount = async (iconUrl?: string) => {
  await act(async () => root.render(React.createElement(ConnectorIcon, { item: { iconUrl } })));
};

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  originalRevokeObjectURL = URL.revokeObjectURL;
  URL.revokeObjectURL = jest.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  URL.revokeObjectURL = originalRevokeObjectURL;
});

it("uses the Material power_2 mark when a connector has no package icon", async () => {
  await mount();
  expect(container.querySelector('[data-material-icon="power_2"]')).not.toBeNull();
  expect(fetchConnectorIcon).not.toHaveBeenCalled();
  expect(container.querySelector("img")).toBeNull();
});

it("replaces the default mark with the authenticated package icon", async () => {
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = jest.fn(() => "blob:connector");
  try {
    jest.mocked(fetchConnectorIcon).mockResolvedValue(new Blob(["icon"], { type: "image/png" }));
    await mount("/api/connectors/icon?id=docs");
    expect(fetchConnectorIcon).toHaveBeenCalledWith("/api/connectors/icon?id=docs", { signal: expect.any(AbortSignal) });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:connector");
    expect(container.querySelector('[data-material-icon="power_2"]')).toBeNull();
  } finally {
    URL.createObjectURL = originalCreate;
  }
});
