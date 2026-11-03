/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextEncoder } from "node:util";
import { getExecuteExamples } from "../lib/executeExamples";
import { ExecuteAgentModal } from "./ExecuteAgentModal";
import { executeAgent } from "@/shared/data/api/requests/execute";
import { uploadFile } from "@/shared/data/api/requests/uploads";
import { ApiError } from "@/shared/data/api/http";

jest.mock("@/shared/data/api/requests/execute", () => ({ executeAgent: jest.fn() }));
jest.mock("@/shared/data/api/requests/uploads", () => ({ ...jest.requireActual("@/shared/data/api/requests/uploads"), uploadFile: jest.fn() }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
// Keep the form and request lifecycle; replace portal widgets with DOM controls.
jest.mock("antd", () => {
  const React = require("react");
  const wrap = ({ children }: any) => React.createElement("div", null, children);
  return {
    Modal: ({ title, children, footer }: any) => React.createElement("div", null, title, children, footer),
    Alert: ({ message }: any) => React.createElement("div", { role: "alert" }, message),
    Button: ({ children, onClick, disabled }: any) => React.createElement("button", { onClick, disabled }, children),
    Input: Object.assign(({ size, ...props }: any) => React.createElement("input", props), { TextArea: ({ className, ...props }: any) => React.createElement("textarea", props) }),
    Select: ({ options, value, onChange, disabled }: any) => React.createElement("select", { value, disabled, onChange: (e: any) => onChange(e.target.value) }, options.map((o: any) => React.createElement("option", { value: o.value, key: o.value }, o.label))),
    Space: wrap, Spin: () => null,
    Typography: { Text: wrap, Link: ({ children, ...props }: any) => React.createElement("a", props, children) },
  };
});

let root: Root;
let host: HTMLDivElement;
let close: jest.Mock;
beforeEach(async () => {
  Object.assign(globalThis, { TextEncoder, IS_REACT_ACT_ENVIRONMENT: true });
  jest.clearAllMocks();
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host); close = jest.fn();
  await act(async () => root.render(<ExecuteAgentModal agentKey="demo" onClose={close} />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(b => b.textContent === text);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}

async function loadExample(id = "meeting") {
  const select = host.querySelector("select")!;
  await act(async () => {
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

test("validates before submission and displays the accepted result with its Chat link", async () => {
  await click("execute.run");
  expect(executeAgent).not.toHaveBeenCalled();
  expect(host.textContent).toContain("execute.validation.message");
  jest.mocked(executeAgent).mockResolvedValueOnce({ code: 0, msg: "success", status: 200, data: { chatId: "chat-1", status: "success", output: { summary: "done" } } });
  await loadExample(); await click("execute.run");
  expect(jest.mocked(executeAgent).mock.calls[0][0]).toMatchObject({ agentKey: "demo", accessLevel: "default", requestId: expect.any(String) });
  expect(host.textContent).toContain('"summary": "done"');
  expect(host.querySelector("a")!.getAttribute("href")).toBe("/agent/demo?chatId=chat-1");
});
test("keeps platform failure Chat IDs available for diagnosis", async () => {
  jest.mocked(executeAgent).mockRejectedValueOnce(new ApiError("output_invalid", { data: { chatId: "failed-chat" } }));
  await loadExample(); await click("execute.run");
  expect(host.textContent).toContain("output_invalid");
  expect(host.querySelector("a")!.getAttribute("href")).toContain("chatId=failed-chat");
});
test("cancelling aborts the original request and permits another execution", async () => {
  jest.mocked(executeAgent).mockImplementationOnce((_request, _files, signal) => new Promise((_resolve, reject) => {
    signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  await loadExample(); await click("execute.run");
  const signal = jest.mocked(executeAgent).mock.calls[0][2]!;
  expect(host.textContent).toContain("execute.running");
  await click("execute.cancel");
  expect(signal.aborted).toBe(true);
  expect(host.textContent).toContain("execute.cancelled");
  expect([...host.querySelectorAll("button")].some(b => b.textContent === "execute.run")).toBe(true);
});
test("unmounting interrupts an outstanding request", async () => {
  jest.mocked(executeAgent).mockImplementationOnce(() => new Promise(() => {}));
  await loadExample(); await click("execute.run");
  const signal = jest.mocked(executeAgent).mock.calls[0][2]!;
  await act(async () => root.render(<div />));
  expect(signal.aborted).toBe(true);
});


test("separates task configuration and results without protocol notices", () => {
  const inputPanel = host.querySelector('section[aria-label="execute.requestPanel"]')!;
  const outputPanel = host.querySelector('section[aria-label="execute.resultPanel"]')!;
  expect(inputPanel.querySelectorAll("textarea")).toHaveLength(4);
  expect(outputPanel.querySelectorAll("textarea")).toHaveLength(0);
  expect(outputPanel.textContent).toContain("execute.empty");
  expect(inputPanel.querySelector("details")!.textContent).toContain("execute.settings");
  expect(host.textContent).not.toContain("execute.hint");
});

test("makes stopping explicit when closing an active execution", async () => {
  jest.mocked(executeAgent).mockImplementationOnce(() => new Promise(() => {}));
  await loadExample(); await click("execute.run");
  const signal = jest.mocked(executeAgent).mock.calls[0][2]!;
  await click("execute.stopClose");
  expect(signal.aborted).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
});


test("loads every example as a complete message, input and output schema bundle", async () => {
  const examples = getExecuteExamples(key => key);
  expect(examples.length).toBeGreaterThan(1);
  for (const example of examples) {
    await loadExample(example.id);
    const fields = host.querySelectorAll("textarea");
    expect(fields[0].value).toBe(example.request.message);
    expect(JSON.parse(fields[1].value)).toEqual(example.request.input);
    expect(JSON.parse(fields[2].value)).toEqual(example.request.outputSchema);

  }
});

test("places execution controls between the input and output panels", () => {
  const input = host.querySelector('section[aria-label="execute.requestPanel"]')!;
  const controls = input.nextElementSibling!;
  expect(controls.getAttribute("role")).toBe("group");
  expect(controls.textContent).toContain("execute.run");
  expect(controls.nextElementSibling?.getAttribute("aria-label")).toBe("execute.resultPanel");
  expect([...host.querySelectorAll("button")].filter(button => button.textContent === "execute.run")).toHaveLength(1);
});


test("keeps the example selector in the input header and loads without an extra button", () => {
  const input = host.querySelector('section[aria-label="execute.requestPanel"]')!;
  expect(input.querySelector("h3")!.parentElement!.querySelector("select")).toBeTruthy();
  expect([...host.querySelectorAll("button")].some(button => button.textContent === "execute.example")).toBe(false);
});


async function chooseReferenceFiles() {
  const input = host.querySelector<HTMLInputElement>('input[type="file"][hidden]')!;
  const files = [new File(["one"], "one.png", { type: "image/png" }), new File(["two"], "two.png", { type: "image/png" })];
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: files });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const uploaded = (name: string) => ({ code: 0, msg: "success", status: 200, data: { chatId: "upload-chat", upload: { id: name, type: "file", name, url: `@chat/${name}`, mimeType: "image/png" } } });

test("uploads sequentially into one Chat and executes the references JSON", async () => {
  await loadExample();
  jest.mocked(uploadFile).mockResolvedValueOnce(uploaded("one.png")).mockResolvedValueOnce(uploaded("two.png"));
  await chooseReferenceFiles();
  expect(uploadFile).toHaveBeenCalledTimes(2);
  expect(jest.mocked(uploadFile).mock.calls[0][0].chatId).toBeUndefined();
  expect(jest.mocked(uploadFile).mock.calls[1][0].chatId).toBe("upload-chat");
  const references = JSON.parse(host.querySelectorAll("textarea")[3].value);
  expect(references.map((ref: any) => ref.name)).toEqual(["one.png", "two.png"]);
  expect(host.querySelector<HTMLInputElement>('input:not([type="file"])')!.value).toBe("upload-chat");
  expect(host.querySelector<HTMLInputElement>('input[type="file"]:not([hidden])')!.disabled).toBe(true);
  jest.mocked(executeAgent).mockResolvedValueOnce({ code: 0, msg: "success", status: 200, data: { chatId: "upload-chat", status: "success", output: {} } });
  await click("execute.run");
  expect(jest.mocked(executeAgent).mock.calls[0][0]).toMatchObject({ chatId: "upload-chat", references });
  expect(jest.mocked(executeAgent).mock.calls[0][1]).toEqual([]);
  expect(host.querySelector("a")!.getAttribute("href")).toContain("chatId=upload-chat");
  await loadExample("owners");
  expect(host.querySelectorAll("textarea")[3].value).toBe("");
  expect(host.querySelector<HTMLInputElement>('input:not([type="file"])')!.value).toBe("");
});

test("disables execution during upload and preserves successful references on failure", async () => {
  await loadExample();
  let resolveUpload!: (value: ReturnType<typeof uploaded>) => void;
  jest.mocked(uploadFile).mockImplementationOnce(() => new Promise(resolve => { resolveUpload = resolve; }))
    .mockRejectedValueOnce(new Error("upload failed"));
  await chooseReferenceFiles();
  expect([...host.querySelectorAll("button")].find(b => b.textContent === "execute.run")!.disabled).toBe(true);
  await click("execute.run");
  expect(executeAgent).not.toHaveBeenCalled();
  await act(async () => resolveUpload(uploaded("one.png")));
  expect(host.textContent).toContain("upload failed");
  expect(JSON.parse(host.querySelectorAll("textarea")[3].value)).toHaveLength(1);
  expect(host.querySelector<HTMLInputElement>('input:not([type="file"])')!.value).toBe("upload-chat");
  await click("execute.clearReferences");
  expect(host.querySelectorAll("textarea")[3].value).toBe("");
  expect(host.querySelector<HTMLInputElement>('input:not([type="file"])')!.value).toBe("");
});

test("submits pasted Chat and references directly without uploading", async () => {
  await loadExample();
  const references = [{ type: "file", name: "pasted.png", url: "@chat/pasted.png", mimeType: "image/png" }];
  const chat = host.querySelector<HTMLInputElement>('input:not([type="file"])')!;
  const json = host.querySelectorAll("textarea")[3];
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(chat, "pasted-chat");
    chat.dispatchEvent(new Event("input", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(json, JSON.stringify(references));
    json.dispatchEvent(new Event("input", { bubbles: true }));
  });
  jest.mocked(executeAgent).mockResolvedValueOnce({ code: 0, msg: "success", status: 200, data: { chatId: "pasted-chat", status: "success", output: {} } });
  await click("execute.run");
  expect(uploadFile).not.toHaveBeenCalled();
  expect(jest.mocked(executeAgent).mock.calls[0][0]).toMatchObject({ chatId: "pasted-chat", references });
  expect(jest.mocked(executeAgent).mock.calls[0][1]).toEqual([]);
});
