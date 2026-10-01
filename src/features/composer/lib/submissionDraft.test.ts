/** @jest-environment jsdom */
import { appReducer } from "@/app/state/reducer";
import { createInitialState } from "@/app/state/state";
const draft = { requestId: "r", chatId: "", agentKey: "a", message: "original", references: [{ type: "file", url: "resource://a" }], skills: [{ id: "pdf", label: "PDF" }] };
function begin() { return appReducer(createInitialState(), { type: "BEGIN_COMPOSER_SUBMISSION", draft }); }
it("restores body, references and skill selection when input was untouched", () => {
  const state = appReducer(begin(), { type: "SETTLE_COMPOSER_SUBMISSION", requestId: "r", accepted: false });
  expect(state.composerDraft).toBe("original");
  expect(state.selectedSkills).toEqual(draft.skills);
  expect(state.restoredSteerReferencesByChatId[""]).toEqual(draft.references);
});
it.each(["RESET_CONVERSATION", "TOUCH_COMPOSER"] as const)("keeps failed content separate after %s", type => {
  let state = appReducer(begin(), { type });
  state = appReducer(state, { type: "SETTLE_COMPOSER_SUBMISSION", requestId: "r", accepted: false });
  expect(state.composerDraft).toBe(""); expect(state.failedSubmissions).toHaveLength(1);
});
it("manual recovery preserves newer input and accepted requests cannot restore", () => {
  let state = appReducer(begin(), { type: "SET_COMPOSER_DRAFT", draft: "new input" });
  state = appReducer(state, { type: "SETTLE_COMPOSER_SUBMISSION", requestId: "r", accepted: false });
  state = appReducer(state, { type: "RESTORE_FAILED_SUBMISSION", requestId: "r" });
  expect(state.composerDraft).toBe("new input\n\noriginal");
  const accepted = appReducer(begin(), { type: "SETTLE_COMPOSER_SUBMISSION", requestId: "r", accepted: true });
  expect(appReducer(accepted, { type: "SETTLE_COMPOSER_SUBMISSION", requestId: "r", accepted: false }).composerDraft).toBe("");
});
