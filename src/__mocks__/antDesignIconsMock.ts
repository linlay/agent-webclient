import React from "react";

function createIcon(name: string) {
  return function MockAntDesignIcon(props: React.HTMLAttributes<HTMLSpanElement>) {
    return React.createElement("span", {
      ...props,
      "data-ant-design-icon": name,
    });
  };
}

export const CaretRightOutlined = createIcon("CaretRightOutlined");
export const CloseCircleFilled = createIcon("CloseCircleFilled");
export const EnterOutlined = createIcon("EnterOutlined");
export const InfoCircleOutlined = createIcon("InfoCircleOutlined");
export const LeftOutlined = createIcon("LeftOutlined");
export const LoadingOutlined = createIcon("LoadingOutlined");
export const RightOutlined = createIcon("RightOutlined");
export const TeamOutlined = createIcon("TeamOutlined");
