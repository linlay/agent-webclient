/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MarkdownECharts } from "./MarkdownECharts";

const mockSetOption = jest.fn();
const mockDispose = jest.fn();
const mockInit = jest.fn(() => ({ setOption: mockSetOption, dispose: mockDispose, resize: jest.fn() }));
jest.mock("echarts", () => ({ init: () => mockInit() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} disconnect() {} } });

it("contains chart initialization failures and disposes charts when content changes or unmounts", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = (code: string) => <><p>Conversation stays readable</p><MarkdownECharts code={code} /></>;
  try {
    mockSetOption.mockImplementationOnce(() => { throw new Error("bad option"); });
    await act(async () => root.render(render('{"series":[]}')));
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.textContent).toContain("Conversation stays readable");
    expect(mockDispose).toHaveBeenCalledTimes(1);
    await act(async () => root.render(render('{"series":[],"title":{}}')));
    expect(host.querySelector('[role="status"]')).toBeNull();
    await act(async () => root.render(render('invalid')));
    expect(mockDispose).toHaveBeenCalledTimes(2);
    await act(async () => root.render(render('{"series":[]}')));
    act(() => root.unmount());
    expect(mockDispose).toHaveBeenCalledTimes(3);
  } finally { if (host.hasChildNodes()) act(() => root.unmount()); host.remove(); }
});
