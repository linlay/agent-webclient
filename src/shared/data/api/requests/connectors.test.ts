/** @jest-environment jsdom */
import { getAdminConnectors, getConnectorDefinition, importConnectorArchive, updateConnectorDefinition } from "./connectors";
import { requestJson } from "@/shared/data/api/http";
jest.mock("@/shared/data/api/http", () => ({
  ...jest.requireActual("@/shared/data/api/http"),
  requestJson: jest.fn(),
}));
beforeEach(() => jest.clearAllMocks());

it("uses installed connector APIs with file identity and a required base hash", async () => {
  await getAdminConnectors();
  await getConnectorDefinition({ id: "builtin.dbx", file: "cli.json" });
  const input = { id: "builtin.dbx", file: "cli.json" as const, content: '{"versionCheck":"dbx --version"}', baseSha256: "original-sha" };
  await updateConnectorDefinition(input);
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/admin/connectors");
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/admin/connectors/detail?id=builtin.dbx&file=cli.json");
  expect(requestJson).toHaveBeenNthCalledWith(3, "/api/admin/connectors/detail", { method: "PUT", body: JSON.stringify(input) });
});

it("uploads exactly one ZIP without forcing a JSON content type and only adds overwrite when requested", async () => {
  jest.mocked(requestJson).mockClear();
  const file = new File(["zip fixture"], "connector.zip", { type: "application/zip" });
  await importConnectorArchive({ file });
  await importConnectorArchive({ file, overwrite: true });
  const calls = jest.mocked(requestJson).mock.calls;
  expect(calls[0][0]).toBe("/api/admin/connectors/import");
  expect(calls[0][1]).toMatchObject({ method: "POST", jsonContentType: false });
  const first = calls[0][1]?.body as FormData;
  const second = calls[1][1]?.body as FormData;
  expect(first.getAll("file")).toEqual([file]);
  expect(first.has("overwrite")).toBe(false);
  expect(second.getAll("file")).toEqual([file]);
  expect(second.get("overwrite")).toBe("true");
});
