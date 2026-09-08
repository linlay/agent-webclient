/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fetchConnectorIcon } from "@/shared/data";
import { ConnectorIcon } from "./ConnectorIcon";

jest.mock("@/shared/data", () => ({ fetchConnectorIcon: jest.fn() }));
let root: Root;
let container: HTMLDivElement;
const createObjectURL = URL.createObjectURL;
const revokeObjectURL = URL.revokeObjectURL;
const mount = async (iconUrl?: string) => {
  await act(async () => root.render(React.createElement(ConnectorIcon, { item: { iconUrl } })));
};
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  URL.createObjectURL = jest.fn(() => "blob:connector-icon");
  URL.revokeObjectURL = jest.fn();
  jest.mocked(fetchConnectorIcon).mockResolvedValue(new Blob(["image"], { type: "image/png" }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

it("uses a hub without requesting missing icons", async () => {
  await mount();
  expect(fetchConnectorIcon).not.toHaveBeenCalled();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
});

it("renders only a Blob image and releases it when the icon version changes", async () => {
  const url = "/api/connectors/icon?id=demo&v=first";
  await mount(url);
  expect(fetchConnectorIcon).toHaveBeenCalledWith(url, { signal: expect.any(AbortSignal) });
  expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:connector-icon");
  const firstSignal = jest.mocked(fetchConnectorIcon).mock.calls[0][1]!.signal!;
  await mount("/api/connectors/icon?id=demo&v=second");
  expect(firstSignal.aborted).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:connector-icon");
  expect(fetchConnectorIcon).toHaveBeenCalledTimes(2);
});

it("falls back on HTTP failures and image decoding errors", async () => {
  jest.mocked(fetchConnectorIcon).mockRejectedValueOnce(new Error("404"));
  await mount("/api/connectors/icon?id=missing");
  expect(container.querySelector("img")).toBeNull();
  await mount("/api/connectors/icon?id=invalid-image");
  await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
});

it("ignores a late response after switching to a connector without an icon", async () => {
  let resolve!: (blob: Blob) => void;
  jest.mocked(fetchConnectorIcon).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount("/api/connectors/icon?id=old");
  await mount();
  await act(async () => resolve(new Blob(["old"])));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(container.querySelector("img")).toBeNull();
});
