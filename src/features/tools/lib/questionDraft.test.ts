import { applyQuestionDraft } from "./questionDraft";
import { reduceToolsState, createInitialToolsState } from "./toolsState";
import type { QuestionActiveAwaiting } from "./toolsState";
import { AIAwaitQuestionType } from "@/shared/contracts/agentEvents";

const awaiting: QuestionActiveAwaiting = { key: "run#ask",runId:"run",awaitingId:"ask",agentKey:"agent",mode:"question",timeout:null,
  questions:[{id:"text",question:"Text",type:AIAwaitQuestionType.Text},{id:"multi",question:"Options",type:AIAwaitQuestionType.MultiSelect,allowFreeText:true,options:[{label:"one"}]},{id:"password",question:"Password",type:AIAwaitQuestionType.Password},{id:"datetime",question:"Time",type:AIAwaitQuestionType.DateTime}] };

test("drafts stay scoped to the live awaiting and never regress a revision",()=>{
  const initial={...createInitialToolsState(),activeAwaiting:awaiting};
  const action={type:"SET_QUESTION_DRAFT" as const,runId:"run",awaitingId:"ask",draft:{revision:2,answers:[{id:"text",answer:"voice answer"}]}};
  const state=reduceToolsState(initial,action);
  expect(state.activeAwaiting).toMatchObject({questionDraft:action.draft});
  for (const changed of [{runId:"other"},{awaitingId:"other"},{draft:{revision:1,answers:[{id:"text",answer:"old"}]}},{draft:{revision:2,answers:[{id:"text",answer:"same revision"}]}}]) {
    expect(reduceToolsState(state,{...action,...changed}).activeAwaiting).toBe(state.activeAwaiting);
  }
  const resolved={...awaiting,resolutionReason:"remote_answered" as const};
  expect(applyQuestionDraft(resolved,action.draft)).toBe(resolved);
});

test("readonly projection rejects password and malformed values and converts supported datetime for the existing form",()=>{
  for(const answers of [[{id:"password",answer:"secret"}],[{id:"text",answer:[]}],[{id:"missing",answer:"x"}],[{id:"text",answer:"x"},{id:"text",answer:"y"}]]) {
    expect(applyQuestionDraft(awaiting,{revision:1,answers})).toBe(awaiting);
  }
  const raw={revision:1,answers:[{id:"multi",answers:["one","free"]},{id:"datetime",answer:"2028-02-29T15:00"}]};
  const got=applyQuestionDraft(awaiting,raw) as QuestionActiveAwaiting;
  raw.answers[0].answers![0]="changed";
  expect(got.questionDraft?.answers).toEqual([{id:"multi",answers:["one","free"]},{id:"datetime",answer:"2028-02-29 15:00:00"}]);
});
