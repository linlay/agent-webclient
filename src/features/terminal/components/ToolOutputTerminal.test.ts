/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ToolOutputState } from "@/features/timeline/lib/timelineState";
import { ToolOutputTerminal } from "@/features/terminal/components/ToolOutputTerminal";

const mockTerminalInstances: Array<{
  addons: unknown[];
  dispose: jest.Mock;
  options: Record<string, unknown>;
  reset: jest.Mock;
  writes: string[];
}> = [];
const mockWebglAddonInstances: Array<{
  dispose: jest.Mock;
  emitContextLoss: () => void;
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
    addons: unknown[] = [];

    constructor(options: Record<string, unknown>) {
      this.options = options;
      mockTerminalInstances.push(this);
    }

    loadAddon(addon: unknown) {
      this.addons.push(addon);
    }

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

    write(text: string, callback?: () => void) {
      this.writes.push(text);
      callback?.();
    }
  },
}));

jest.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class MockWebglAddon {
    dispose = jest.fn();
    private contextLossListener: (() => void) | null = null;

    constructor() {
      mockWebglAddonInstances.push(this);
    }

    onContextLoss(listener: () => void) {
      this.contextLossListener = listener;
      return { dispose: jest.fn() };
    }

    emitContextLoss() {
      this.contextLossListener?.();
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
    mockWebglAddonInstances.length = 0;
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
    expect(terminal.options).toMatchObject({
      allowTransparency: true,
      customGlyphs: true,
      fontSize: 11,
      lineHeight: 1,
    });
    expect(
      (terminal.options.theme as { background?: string }).background,
    ).toBe("rgba(0, 0, 0, 0)");
    expect(mockWebglAddonInstances).toHaveLength(1);
    expect(terminal.addons).toContain(mockWebglAddonInstances[0]);
    expect(terminal.writes).toEqual(["scan\n"]);

    act(() => {
      root.render(
        React.createElement(ToolOutputTerminal, {
          output: output("scan\nwaiting\n", 1),
          themeMode: "dark",
        }),
      );
    });
    expect(
      (terminal.options.theme as { background?: string }).background,
    ).toBe("rgba(0, 0, 0, 0)");
    expect(terminal.writes).toEqual(["scan\n", "waiting\n"]);
    expect(terminal.reset).not.toHaveBeenCalled();

    act(() => mockWebglAddonInstances[0].emitContextLoss());
    expect(mockWebglAddonInstances[0].dispose).toHaveBeenCalledTimes(1);

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
