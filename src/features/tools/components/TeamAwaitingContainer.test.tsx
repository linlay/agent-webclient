/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TeamAwaitingContainer } from "./TeamAwaitingContainer";
import type { FormActiveAwaiting } from "../lib/toolsState";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let mockChild: any;
jest.mock("./buildin", () => ({ Buildin: { QuestionDialog: (props: any) => { mockChild = props; return null; } } }));
jest.mock("./AwaitingHtmlContainer", () => ({ AwaitingHtmlContainer: (props: any) => { mockChild = props; return null; } }));
const forms = ["one", "two"].map(id => ({ id: `public-${id}`, title: id, form: {
 awaitingId: id, mode: "question", view: { source: "builtin", key: "question", renderer: "native" },
 questions: [{ id: `q-${id}`, title: "Choose", options: [{label:"Yes",value:"yes"}] }]
} }));
test("Team collects children and submits the original ordered forms/params contract once", async () => {
 const host = document.createElement("div"), root = createRoot(host), submit = jest.fn().mockResolvedValue(undefined);
 const data = { key:"root:wait", runId:"root", awaitingId:"wait", agentKey:"team", mode:"form", forms,
 createdAt:Date.now(), timeout:60, view:{source:"builtin",key:"team-hitl",renderer:"native"} } as FormActiveAwaiting;
 try {
  await act(async () => root.render(<TeamAwaitingContainer data={data} onSubmit={submit}/>));
  expect(mockChild.data.awaitingId).toBe("one");
  await act(async () => mockChild.onSubmit({runId:"root",awaitingId:"one",params:[{id:"q-one",value:"yes"}]}));
  expect(submit).not.toHaveBeenCalled();
  expect(mockChild.data.awaitingId).toBe("two");
  await act(async () => mockChild.onSubmit({runId:"root",awaitingId:"two",params:[{id:"q-two",value:"yes"}]}));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0][0]).toEqual({runId:"root",awaitingId:"wait",params:forms.map((form,i)=>({
   id:form.id,decision:"approve",form:{...form.form,params:[{id:i===0?"q-one":"q-two",value:"yes"}]}
  }))});
 } finally { act(() => root.unmount()); }
});
