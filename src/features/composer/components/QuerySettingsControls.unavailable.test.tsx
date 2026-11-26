/** @jest-environment jsdom */
import { interactionDefaults } from "@/shared/contracts/interaction";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QuerySettingsControls, clearCoderModelOptionsCacheForTest } from "./QuerySettingsControls";

jest.mock("@/app/state/AppContext", () => ({
  useAppContext: () => ({ state: { agents: [] }, dispatch: jest.fn() }),
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/data", () => ({
  getModelOptions: jest.fn(),
  updateAgentModelConfig: jest.fn(),
}));
const worker = {
  type: "agent",
  sourceId: "coder",
  raw: {
    mode: "CODER",
    modelOptions: {
      models: [{ key: "available-model", name: "Available Model" }],
      reasoningEfforts: [{ key: "HIGH", label: "High" }],
    },
  },
};
jest.mock("@/features/workers/lib/currentWorker", () => ({
  resolveCurrentWorkerSummary: () => worker,
}));

async function render(overrides: { compact?: boolean; modelKey?: string } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => root.render(
    React.createElement(QuerySettingsControls, {
      accessLevel: "ask_for_approval",
      compact: overrides.compact,
      modelOverride: { key: overrides.modelKey ?? "retired-model", reasoningEffort: "HIGH" },
      interactionConfig: interactionDefaults("CODER"),
      onAccessLevelChange: jest.fn(),
      onModelOverrideChange: jest.fn(),
    }),
  ));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  clearCoderModelOptionsCacheForTest();
  document.body.innerHTML = "";
});

it("shows the unavailable hint at the model label position in danger color", async () => {
  const view = await render();
  const label = view.container.querySelector(".query-model-label");
  expect(label?.textContent).toBe("composer.query.model.unavailable");
  expect(label?.classList.contains("query-model-label-unavailable")).toBe(true);
  expect(label?.className).toContain("tw:text-danger");
  expect(label?.className).not.toContain("tw:text-text-main");
  // The model name is replaced instead of repeated next to the button.
  expect(view.container.textContent).not.toContain("retired-model");
  // Reasoning effort belongs to the selected model, so it is hidden while unavailable.
  expect(view.container.textContent).not.toContain("composer.query.reasoning.HIGH");
  expect(view.container.querySelector(".query-model-error")).toBeNull();
  expect(
    view.container.querySelector('button[aria-label*="composer.query.model.unavailable"]'),
  ).not.toBeNull();
  view.unmount();
});

it("keeps the unavailable hint as a detached status in compact mode", async () => {
  const view = await render({ compact: true });
  expect(view.container.querySelector(".query-model-label")).toBeNull();
  expect(view.container.querySelector(".query-model-error")?.textContent)
    .toBe("composer.query.model.unavailable");
  view.unmount();
});

it("keeps the model label unchanged while the configured model is available", async () => {
  const view = await render({ modelKey: "available-model" });
  const label = view.container.querySelector(".query-model-label");
  expect(label?.textContent).toBe("Available Model");
  expect(label?.className).not.toContain("tw:text-danger");
  expect(view.container.textContent).toContain("composer.query.reasoning.HIGH");
  expect(view.container.querySelector(".query-model-error")).toBeNull();
  view.unmount();
});
