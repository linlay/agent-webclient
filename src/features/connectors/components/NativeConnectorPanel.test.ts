/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";
import { getConnectorConnection, updateNativeConnectorConnection } from "@/shared/data";
import { NativeConnectorPanel } from "./NativeConnectorPanel";
jest.mock("@/shared/data", () => ({getConnectorConnection: jest.fn(), updateNativeConnectorConnection: jest.fn()}));
it("configures and disconnects a read-only builtin without a login or tool picker", async () => {
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
 let configured = false;
 jest.mocked(getConnectorConnection).mockImplementation(async () => ({code:0,msg:"",data:{connectorId:"builtin.desktop",configured,readiness: configured ? "ready" : "configuration_required"}}));
 jest.mocked(updateNativeConnectorConnection).mockImplementation(async (_id, action) => {if(action === "connect") configured=true; if(action === "disconnect") configured=false;return {code:0,msg:"",data:{}};});
 const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
 try {
  await act(async () => root.render(React.createElement(I18nProvider,{locale:"zh-CN",persistLocale:false},React.createElement(NativeConnectorPanel,{id:"builtin.desktop"}))));
  const click = async (text: string) => act(async () => {const button=Array.from(container.querySelectorAll("button")).find(b=>b.textContent===text)!;button.click();});
  expect(container.textContent).toContain("未配置");
  expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  await click("完成配置"); expect(container.textContent).toContain("已配置");
  await click("检查配置"); expect(configured).toBe(true);
  await click("断开配置"); expect(container.textContent).toContain("未配置");
  expect(jest.mocked(updateNativeConnectorConnection).mock.calls.map(call=>call[1])).toEqual(["connect","check","disconnect"]);
 } finally {await act(async()=>root.unmount());container.remove();}
});

it("allows configuring the next connector after switching during an in-flight action", async () => {
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
 let finishAction!: () => void;
 jest.mocked(getConnectorConnection).mockImplementation(async id => ({code:0,msg:"",data:{connectorId:id,configured:false,readiness:"configuration_required"}}));
 jest.mocked(updateNativeConnectorConnection).mockImplementationOnce(() => new Promise(resolve => { finishAction = () => resolve({code:0,msg:"",data:{}}); }));
 const container = document.createElement("div"); const root = createRoot(container);
 const render = (id: string) => React.createElement(I18nProvider,{locale:"zh-CN",persistLocale:false},React.createElement(NativeConnectorPanel,{id}));
 try {
  await act(async () => root.render(render("builtin.desktop")));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector("button")!.disabled).toBe(true);
  await act(async () => root.render(render("another.native")));
  expect(container.textContent).toContain("未配置");
  expect(container.querySelector("button")!.disabled).toBe(false);
 } finally {
  await act(async () => { finishAction?.(); });
  await act(async () => root.unmount());
 }
});
