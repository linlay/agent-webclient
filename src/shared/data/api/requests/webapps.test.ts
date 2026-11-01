/** @jest-environment jsdom */
import { requestJson } from "../http";
import { deleteWebapp, getWebapps, installWebapp, launchWebapp, preflightWebapp, setWebappState, uploadWebapp } from "./webapps";
import type { WebappEntry, WebappReview } from "../dto/webapps";
jest.mock("../http", () => ({ requestJson: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

it("uploads one ZIP as raw bytes and binds installation to the reviewed digest and revision", async () => {
  const file = new File(["zip"], "app.zip"); const controller = new AbortController();
  await uploadWebapp(file, controller.signal); await preflightWebapp("upload", controller.signal);
  await installWebapp({ uploadId: "upload", sha256: "reviewed-sha", expectedRevision: "old", manifest: { id: "ignored-untrusted-field" } } as WebappReview, controller.signal);
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/admin/webapps/uploads", expect.objectContaining({ method: "POST", body: file, headers: { "Content-Type": "application/zip" }, jsonContentType: false, retryUnauthorized: false, signal: controller.signal }));
  expect(requestJson).toHaveBeenNthCalledWith(3, "/api/admin/webapps/install", expect.objectContaining({ body: JSON.stringify({ uploadId: "upload", sha256: "reviewed-sha", expectedRevision: "old" }), retryUnauthorized: false }));
});
it("keeps lifecycle and purge decisions explicit and never retries mutations after unauthorized responses", async () => {
  const entry = { id: "webapp-0123456789abcdef", revision: "package", stateRevision: "state" } as WebappEntry;
  await setWebappState(entry.id, "stop", entry); await deleteWebapp(entry, false); await launchWebapp(entry.id);
  expect(requestJson).toHaveBeenNthCalledWith(1, `/api/admin/webapps/${entry.id}/stop`, expect.objectContaining({ method: "POST", body: JSON.stringify({ expectedRevision: "package", expectedStateRevision: "state" }), retryUnauthorized: false }));
  expect(requestJson).toHaveBeenNthCalledWith(2, `/api/admin/webapps/${entry.id}`, expect.objectContaining({ method: "DELETE", body: JSON.stringify({ expectedRevision: "package", purgeData: false }), retryUnauthorized: false }));
  expect(requestJson).toHaveBeenNthCalledWith(3, `/api/admin/webapps/${entry.id}/launch-ticket`, expect.objectContaining({ method: "POST", body: "{}", retryUnauthorized: false }));
  expect(() => launchWebapp("../admin")).toThrow("webapp_invalid_id");
});
it("reads installed state without server-state caching", async () => { await getWebapps(); expect(requestJson).toHaveBeenCalledWith("/api/admin/webapps", { cache: "no-store", signal: undefined }); });
