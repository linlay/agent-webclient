/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ToolOutputState } from "@/app/state/types";
import { ToolOutputTerminal } from "@/features/terminal/components/ToolOutputTerminal";

const mockTerminalInstances: Array<{
  dispose: jest.Mock;
  reset: jest.Mock;
  writes: string[];
}> = [];

jest.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal {
    cols = 80;
    rows = 1;
    options: Record<string, unknown>;
    element: HTMLElement | undefined;
    buffer = {
      active: {
        baseY: 0,
        cursorY: 0,
        length: 1,
        getLine: () => ({ translateToString: () => "" }),
      },
    };
    dispose = jest.fn();
    reset = jest.fn();
    writes: string[] = [];

    constructor(options: Record<string, unknown>) {
      this.options = options;
      mockTerminalInstances.push(this);
    }

    loadAddon() {}

    open(container: HTMLElement) {
      const element = document.createElement("div");
      const screen = document.createElement("div");
      screen.className = "xterm-screen";
      element.appendChild(screen);
      container.appendChild(element);
      this.element = element;
    }

    resize(columns: number, rows: number) {
      this.cols = columns;
      this.rows = rows;
    }

    scrollToBottom() {}

    write(text: string, callback?: () => void) {
      this.writes.push(text);
      callback?.();
    }
  },
}));

jest.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    proposeDimensions() {
      return { cols: 80, rows: 1 };
    }
  },
}));

function output(text: string, chunkIndex: number): ToolOutputState {
  return {
    lastChunkIndex: chunkIndex,
    truncated: false,
    segments: [{ stream: "stdout", text }],
  };
}

describe("ToolOutputTerminal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    mockTerminalInstances.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("streams suffixes, resets rewritten output, and disposes on unmount", () => {
    act(() => {
      root.render(
        React.createElement(ToolOutputTerminal, {
          output: output("scan\n", 0),
          themeMode: "light",
        }),
      );
    });

    const terminal = mockTerminalInstances[0];
    expect(terminal.writes).toEqual(["scan\n"]);

    act(() => {
      root.render(
        React.createElement(ToolOutputTerminal, {
          output: output("scan\nwaiting\n", 1),
          themeMode: "dark",
        }),
      );
    });
    expect(terminal.writes).toEqual(["scan\n", "waiting\n"]);
    expect(terminal.reset).not.toHaveBeenCalled();

    act(() => {
      root.render(
        React.createElement(ToolOutputTerminal, {
          output: output("retained tail\n", 2),
          themeMode: "dark",
        }),
      );
    });
    expect(terminal.reset).toHaveBeenCalledTimes(1);
    expect(terminal.writes).toEqual([
      "scan\n",
      "waiting\n",
      "retained tail\n",
    ]);

    act(() => root.unmount());
    expect(terminal.dispose).toHaveBeenCalledTimes(1);
    root = createRoot(container);
  });
});
