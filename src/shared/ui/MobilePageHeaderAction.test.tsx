/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MobilePageHeaderActionProvider,
  MobilePageHeaderActionSlot,
  useMobilePageHeaderAction,
  type MobilePageHeaderAction,
} from "./MobilePageHeaderAction";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: Root;

function Register({ action }: { action: MobilePageHeaderAction | null }) {
  useMobilePageHeaderAction(action);
  return null;
}

async function render(action: MobilePageHeaderAction | null) {
  await act(async () =>
    root.render(
      <MobilePageHeaderActionProvider>
        <Register action={action} />
        <MobilePageHeaderActionSlot />
      </MobilePageHeaderActionProvider>,
    ),
  );
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("renders the registered action in the page header slot", async () => {
  const onActivate = jest.fn();
  await render({
    label: "旅行助手",
    ariaLabel: "切换智能体，当前为 旅行助手",
    avatar: <span data-testid="agent-avatar" />,
    actionLabel: "切换",
    icon: "swap_horiz",
    expanded: false,
    onActivate,
  });

  const button = host.querySelector<HTMLButtonElement>("button")!;
  expect(button).not.toBeNull();
  expect(button.textContent).toContain("旅行助手");
  expect(button.textContent).toContain("切换");
  expect(button.querySelector("[data-testid='agent-avatar']")).not.toBeNull();
  expect(button.getAttribute("aria-label")).toBe("切换智能体，当前为 旅行助手");
  expect(button.getAttribute("aria-haspopup")).toBe("dialog");
  expect(button.getAttribute("aria-expanded")).toBe("false");

  await act(async () => button.click());
  expect(onActivate).toHaveBeenCalledTimes(1);
});

it("tracks expanded state and clears the slot when the page unregisters", async () => {
  const onActivate = jest.fn();
  const action: MobilePageHeaderAction = {
    label: "切换",
    expanded: true,
    onActivate,
  };
  await render(action);
  expect(host.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");

  await render(null);
  expect(host.querySelector("button")).toBeNull();
});
