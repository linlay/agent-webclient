/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { useEmbedComposer } from "./useEmbedComposer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("submits through the supplied Composer path, reports local queueing, and preserves an existing draft", async () => {
  window.history.replaceState(null, "", "/embed/support");
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const submit = jest.fn(); const interrupt = jest.fn(async () => undefined);
  function Harness() {
    const [value, setValue] = useState("");
    useEmbedComposer({ value, setValue, disabled: false, sendDisabled: !value.trim(), busy: true, hasAttachments: false, submit, interrupt });
    return <textarea value={value} readOnly />;
  }
  const command = (type: string, text?: string) => new Promise((resolve, reject) => {
    const detail = { type, text, resolve, reject, handled: false };
    window.dispatchEvent(new CustomEvent("agent:embed-composer", { detail }));
    if (!detail.handled) reject(new Error("unhandled"));
  });
  await act(async () => root.render(<Harness />));
  let response!: Promise<unknown>;
  await act(async () => { response = command("send", "hello"); });
  await expect(response).resolves.toEqual({ status: "queued" });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(host.querySelector("textarea")?.value).toBe("hello");
  await expect(command("send", "replacement")).rejects.toThrow("composer_has_draft");
  expect(host.querySelector("textarea")?.value).toBe("hello");
  await expect(command("interrupt")).resolves.toEqual({ status: "requested" });
  expect(interrupt).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount()); host.remove();
  window.history.replaceState(null, "", "/");
});
