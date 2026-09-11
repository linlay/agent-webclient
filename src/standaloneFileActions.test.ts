import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
const { createStandaloneFileActions, FILE_ACTIONS_PATH, systemFileCommand } = require("../scripts/standalone-file-actions.cjs");

describe("standalone local file service", () => {
  let directory: string;
  let middleware: ReturnType<typeof createStandaloneFileActions>;
  let token: string;
  const runFile = jest.fn();
  async function request({ method = "POST", body = Buffer.from("document bytes"), headers = {}, socket = {}, url = FILE_ACTIONS_PATH } = {} as any) {
    const req = Object.assign(Readable.from([body]), {
      method, url,
      headers: {
        host: "localhost:11948", origin: "http://localhost:11948", "sec-fetch-site": "same-origin",
        "x-webclient-local": "1", "x-webclient-token": token,
        "x-file-action": "reveal", "x-file-name": encodeURIComponent("客户 $(echo test).docx"),
        "content-type": "application/octet-stream", ...headers,
      },
      socket: { remoteAddress: "::1", localPort: 11948, ...socket },
    });
    const res = { statusCode: 200, setHeader: jest.fn(), end: jest.fn() };
    const next = jest.fn();
    await middleware(req, res, next);
    return { status: res.statusCode, body: res.end.mock.calls[0] ? JSON.parse(res.end.mock.calls[0][0]) : null, next };
  }
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "webclient-file-actions-test-"));
    runFile.mockReset().mockResolvedValue(undefined);
    middleware = createStandaloneFileActions({ platform: "darwin", runFile, tempDirectory: directory, maxBytes: 1024 });
    token = (await request({ method: "GET" })).body.token;
  });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  it("saves exact bytes under a private cache and launches Finder without a shell", async () => {
    const response = await request();
    expect(response.body).toEqual({ ok: true });
    expect(runFile).toHaveBeenCalledWith("open", ["-R", expect.any(String)], { timeout: 15000, windowsHide: true });
    const filePath = runFile.mock.calls[0][1][1];
    expect(filePath.startsWith(directory + path.sep)).toBe(true);
    expect(path.basename(filePath)).toBe("客户 $(echo test).docx");
    expect(await fs.readFile(filePath, "utf8")).toBe("document bytes");
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
    expect(response.body).not.toHaveProperty("path");
  });

  it("reuses the same copy for opening and revealing, preserving local edits", async () => {
    await request({ headers: { "x-file-action": "open-default" } });
    const filePath = runFile.mock.calls[0][1][0];
    await fs.writeFile(filePath, "locally edited");
    await request();
    expect(runFile.mock.calls[1][1]).toEqual(["-R", filePath]);
    expect(await fs.readFile(filePath, "utf8")).toBe("locally edited");
    await request({ body: Buffer.from("updated upstream") });
    expect(runFile.mock.calls[2][1][1]).not.toBe(filePath);
  });

  it.each([
    { socket: { remoteAddress: "192.168.1.2" } },
    { headers: { host: "evil.example:11948" } },
    { headers: { origin: "http://evil.example" } },
    { headers: { "sec-fetch-site": "cross-site" } },
    { headers: { "x-webclient-local": "" } },
    { headers: { "x-webclient-token": "wrong" } },
    { headers: { host: "localhost:12345" } },
  ])("rejects unauthorized local requests: %j", async (options) => {
    expect((await request(options)).status).toBe(403);
    expect(runFile).not.toHaveBeenCalled();
  });

  it.each(["../file.docx", "/etc/hosts", "folder\\file.txt", "file:stream.txt", "NUL.txt", ".hidden", "bad%name\n.docx"])("rejects unsafe filename %s", async (filename) => {
    expect((await request({ headers: { "x-file-name": encodeURIComponent(filename) } })).status).toBe(400);
    expect(runFile).not.toHaveBeenCalled();
  });

  it.each(["run.command", "setup.exe", "script.bat", "app.desktop", "tool.js"])("does not execute %s through a file association", async (filename) => {
    expect((await request({ headers: { "x-file-name": filename, "x-file-action": "open-default" } })).status).toBe(415);
    expect(runFile).not.toHaveBeenCalled();
  });

  it("enforces body limits with and without Content-Length", async () => {
    expect((await request({ headers: { "content-length": "2048" } })).status).toBe(413);
    expect((await request({ body: Buffer.alloc(2048) })).status).toBe(413);
    expect(runFile).not.toHaveBeenCalled();
  });

  it("reports launch failure without leaking local paths or command output", async () => {
    runFile.mockRejectedValue(new Error("private path: /Users/example"));
    expect((await request()).body).toEqual({ ok: false, code: "action_failed" });
  });

  it("lets unrelated routes pass through and rejects other methods", async () => {
    expect((await request({ url: "/api/file" })).next).toHaveBeenCalled();
    expect((await request({ method: "DELETE" })).status).toBe(405);
  });

  it("maps operating systems to fixed executables and arguments", () => {
    expect(systemFileCommand("win32", "reveal", "C:\\cache\\file.docx")).toEqual(["explorer.exe", ["/select,C:\\cache\\file.docx"]]);
    expect(systemFileCommand("win32", "open-default", "C:\\cache\\file.docx")).toEqual(["rundll32.exe", ["url.dll,FileProtocolHandler", "C:\\cache\\file.docx"]]);
    expect(systemFileCommand("linux", "reveal", "/cache/file.docx")).toEqual(["xdg-open", ["/cache"]]);
    expect(systemFileCommand("linux", "open-default", "/cache/file.docx")).toEqual(["xdg-open", ["/cache/file.docx"]]);
  });
});
