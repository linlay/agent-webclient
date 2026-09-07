/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useConnectorImport } from "./useConnectorImport";

jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const onImport = jest.fn<Promise<string | null>, [File, boolean]>();
const onImported = jest.fn();
let current: ReturnType<typeof useConnectorImport>;
let root: Root;
function Harness() { current = useConnectorImport({ onImport, onImported }); return null; }
const archive = () => new File(["zip fixture"], "connector.zip", { type: "application/zip" });
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(React.createElement(Harness)));
  await act(async () => current.show());
});
afterEach(async () => { await act(async () => root.unmount()); });

it("requires a separate user action before retrying with overwrite", async () => {
  const file = archive();
  onImport.mockRejectedValueOnce({ status: 409, code: "connector_exists" }).mockResolvedValueOnce("demo");
  await act(async () => current.acceptFiles([file]));
  await act(async () => current.submit());
  expect(onImport.mock.calls).toEqual([[file, false]]);
  expect(current.overwriteRequired).toBe(true);
  expect(current.archive).toBe(file);
  expect(current.open).toBe(true);
  await act(async () => current.submit());
  expect(onImport.mock.calls).toEqual([[file, false], [file, true]]);
  expect(current.open).toBe(false);
  expect(current.message).toBe("connectors.import.success");
  expect(onImported).toHaveBeenCalledTimes(1);
});

it("does not upload invalid files and clears overwrite approval when the file changes", async () => {
  await act(async () => current.acceptFiles([archive(), archive()]));
  await act(async () => current.submit());
  expect(current.error).toBe("connectors.import.error.multiple");
  expect(onImport).not.toHaveBeenCalled();
  onImport.mockRejectedValueOnce({ status: 409, code: "connector_exists" });
  await act(async () => current.acceptFiles([archive()]));
  await act(async () => current.submit());
  await act(async () => current.acceptFiles([new File(["data"], "new.zip")]));
  expect(current.overwriteRequired).toBe(false);
  expect(current.error).toBe("");
});

it("retains a failed archive and blocks both closing and duplicate submissions while uploading", async () => {
  let reject!: (cause: Error) => void;
  onImport.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  const file = archive();
  await act(async () => current.acceptFiles([file]));
  let request!: Promise<void>;
  await act(async () => { request = current.submit(); });
  await act(async () => { current.close(); void current.submit(); current.acceptFiles([archive()]); });
  expect(current.open).toBe(true);
  expect(current.archive).toBe(file);
  expect(onImport).toHaveBeenCalledTimes(1);
  await act(async () => { reject(new Error("invalid connector package")); await request; });
  expect(current.error).toBe("invalid connector package");
  expect(current.archive).toBe(file);
  expect(current.overwriteRequired).toBe(false);
});

it("allows cancelling the overwrite prompt without modifying the existing package", async () => {
  onImport.mockRejectedValueOnce({ status: 409, code: "connector_exists" });
  await act(async () => current.acceptFiles([archive()]));
  await act(async () => current.submit());
  await act(async () => current.close());
  expect(onImport).toHaveBeenCalledTimes(1);
  expect(onImported).not.toHaveBeenCalled();
  await act(async () => current.show());
  expect(current.archive).toBeNull();
  expect(current.overwriteRequired).toBe(false);
});
