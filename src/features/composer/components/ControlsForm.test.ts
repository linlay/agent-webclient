import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildControlsParams,
  ControlsForm,
} from "@/features/composer/components/ControlsForm";

const mockSelectProps: Array<Record<string, unknown>> = [];

jest.mock("antd", () => ({
  Select: (props: Record<string, unknown>) => {
    mockSelectProps.push(props);
    return React.createElement("div", { className: "ant-select" });
  },
}));

jest.mock("@/app/state/AppContext", () => ({
  useAppState: () => ({}),
}));

jest.mock("@/features/workers/lib/currentWorker", () => ({
  resolveCurrentWorkerSummary: () => ({
    type: "agent",
    raw: {
      key: "asker",
      controls: [
        {
          key: "target",
          type: "select",
          label: "向",
          defaultValue: "xiaojun",
          options: [{ value: "xiaojun", label: "小君问问" }],
        },
      ],
    },
  }),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("ControlsForm", () => {
  beforeEach(() => {
    mockSelectProps.length = 0;
  });

  it("uses an upward Ant Design Select instead of a native select", () => {
    const html = renderToStaticMarkup(React.createElement(ControlsForm));

    expect(html).toContain("ant-select");
    expect(html).not.toContain("<select");
    expect(mockSelectProps[0]).toMatchObject({
      size: "small",
      placement: "topLeft",
      popupMatchSelectWidth: false,
      showSearch: false,
      value: '"xiaojun"',
      options: [{ value: '"xiaojun"', label: "小君问问" }],
    });
  });

  it("keeps the original typed option value in control params", () => {
    expect(
      buildControlsParams(
        [
          {
            key: "target",
            type: "select",
            label: "向",
            defaultValue: 2,
            options: [{ value: 2, label: "第二项" }],
          },
        ],
        { target: "2" },
      ),
    ).toEqual({ target: 2 });
  });
});
