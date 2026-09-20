import React, { useCallback } from "react";
import { Avatar, AvatarProps } from "antd/es";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

import { AGENT_ICON_NAMES, getAgentIconSource } from "./agentIconAssets";

export { AGENT_ICON_NAMES };

interface AgentIconProps {
  icon?:
    | string
    | {
        color?: string;
        name?: string;
      };
  type: "agent" | "team";
  props?: {
    icon?: React.SVGProps<SVGSVGElement>;
    avatar?: AvatarProps;
  };
}

type IconImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  width?: string | number;
  height?: string | number;
};

function renderIconImage(
  src: string,
  props?: React.SVGProps<SVGSVGElement>,
  source: "builtin" | "default" | "external" = "builtin",
) {
  const imageProps = (props || {}) as IconImageProps;
  return (
    <img
      src={src}
      alt=""
      data-agent-icon-source={source}
      {...imageProps}
      style={{
        width: imageProps.width || 32,
        height: imageProps.height || 32,
        borderRadius: 8,
        objectFit: "cover",
        ...imageProps.style,
      }}
    />
  );
}

export const AgentIcon: React.FC<AgentIconProps> = ({ icon, type, props }) => {
  const render = useCallback(() => {
    if (
      typeof icon === "string" &&
      /\.(svg|png|jpe?g)(?:[?#].*)?$/i.test(icon.trim())
    ) {
      return renderIconImage(icon.trim(), props?.icon, "external");
    }

    if (type === "team") {
      return (
        <Avatar
          icon={<MaterialIcon name="person" />}
          {...props?.avatar}
          style={{
            background: typeof icon === "object" ? icon?.color : undefined,
            ...props?.avatar?.style,
          }}
        />
      );
    }

    const name = typeof icon === "object" ? icon?.name : "";
    const source = AGENT_ICON_NAMES.includes(name as (typeof AGENT_ICON_NAMES)[number])
      ? "builtin"
      : "default";
    return renderIconImage(getAgentIconSource(name), props?.icon, source);
  }, [icon, props?.avatar, props?.icon, type]);
  return render();
};
