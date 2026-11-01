/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useWebapps } from "./useWebapps";
import { getWebappConfiguration, getWebappHost, getWebapps, installWebapp, preflightWebapp, uploadWebapp } from "@/shared/data";
import type { WebappConfiguration, WebappEntry, WebappReview } from "@/shared/data";
jest.mock("@/shared/data", () => ({ getWebappConfiguration: jest.fn(), getWebappHost: jest.fn(), getWebapps: jest.fn(), installWebapp: jest.fn(), preflightWebapp: jest.fn(), uploadWebapp: jest.fn() }));
let mockIdentity = 1;
jest.mock("@/shared/data/auth/dataSession", () => ({ getDataSessionRevision: () => mockIdentity }));
const response = <T,>(data: T) => ({ code: 0, msg: "", data });
const entry = (suffix = "0123456789abcdef"): WebappEntry => ({ id: `webapp-${suffix}`, label: suffix, key: "app", version: "1.0.0", target: "linux-x64", revision: "package", stateRevision: "state", desiredState: "stopped", observedState: "stopped", backend: false, installedAt: 1793500000000 });
const detail = (item = entry()): WebappConfiguration => ({ entry: item, manifest: { schemaVersion: 2, id: item.id, key: "app", label: item.label, version: "1.0.0", target: "linux-x64", appConfig: {} }, policy: { schemaVersion: 1, revision: "policy", skills: [], connectors: [], assistant: false, artifacts: false, connectPorts: [] }, userConfig: {}, configRevision: "config" });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let current: ReturnType<typeof useWebapps>; let root: Root;
function Harness() { current = useWebapps(); return null; }
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; jest.resetAllMocks(); mockIdentity = 1;
  jest.mocked(getWebappHost).mockResolvedValue(response({ staticAvailable: true, maxArchiveMiB: 100, issues: [], warnings: [] }) as any);
  jest.mocked(getWebapps).mockResolvedValue(response({ items: [entry(), entry("fedcba9876543210")] }));
  jest.mocked(getWebappConfiguration).mockImplementation(async id => response(detail(entry(id.slice(7)))));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); });
it("ignores an older detail response after selecting another application", async () => {
  await act(async () => root.render(<Harness />));
  const old = deferred<ReturnType<typeof response<WebappConfiguration>>>();
  jest.mocked(getWebappConfiguration).mockReturnValueOnce(old.promise);
  act(() => { void current.select(entry().id); });
  await act(async () => current.select(entry("fedcba9876543210").id));
  await act(async () => old.resolve(response(detail())));
  expect(current.detail?.entry.id).toBe(entry("fedcba9876543210").id);
});
it("requires an explicit install after upload and preflight and does not automatically start the app", async () => {
  await act(async () => root.render(<Harness />));
  const review = { uploadId: "upload", sha256: "sha", expectedRevision: "", manifest: detail().manifest, size: 3, expandedBytes: 5, fileCount: 2, createdAt: 1793500000000 } satisfies WebappReview;
  jest.mocked(uploadWebapp).mockResolvedValue(response(review)); jest.mocked(preflightWebapp).mockResolvedValue(response(review)); jest.mocked(installWebapp).mockResolvedValue(response({operationId:"a".repeat(48),kind:"install",state:"succeeded",createdAt:Date.now(),result:entry()}));
  await act(async () => current.preflight(new File(["zip"], "app.zip")));
  expect(current.review?.uploadId).toBe("upload"); expect(installWebapp).not.toHaveBeenCalled();
  await act(async () => current.install()); expect(installWebapp).toHaveBeenCalledWith(review, expect.any(AbortSignal)); expect(current.review).toBeUndefined();
});
it("clears private state on identity changes and ignores an old upload that resolves late", async () => {
  await act(async () => root.render(<Harness />));
  const old = deferred<any>(); jest.mocked(uploadWebapp).mockReturnValueOnce(old.promise);
  act(() => { void current.preflight(new File(["zip"], "app.zip")); });
  mockIdentity = 2; jest.mocked(getWebapps).mockResolvedValue(response({ items: [] }));
  await act(async () => root.render(<Harness />));
  await act(async () => old.resolve(response({ uploadId: "private-old-upload", sha256: "private-old-sha" })));
  expect(current.items).toEqual([]); expect(current.detail).toBeUndefined(); expect(current.review).toBeUndefined(); expect(preflightWebapp).not.toHaveBeenCalled();
});
