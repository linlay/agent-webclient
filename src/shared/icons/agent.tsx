import React, { useCallback } from "react";
import { Avatar, AvatarProps } from "antd/es";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

import defaultIcon from "./agent-icons/default.svg";
import atlasIcon from "./agent-icons/atlas.svg";
import canvasIcon from "./agent-icons/canvas.svg";
import chatIcon from "./agent-icons/chat.svg";
import chimeIcon from "./agent-icons/chime.svg";
import chronosIcon from "./agent-icons/chronos.svg";
import coderIcon from "./agent-icons/coder.svg";
import cortexIcon from "./agent-icons/cortex.svg";
import databaseIcon from "./agent-icons/database.svg";
import emitIcon from "./agent-icons/emit.svg";
import fastIcon from "./agent-icons/fast.svg";
import fluxIcon from "./agent-icons/flux.svg";
import focusIcon from "./agent-icons/focus.svg";
import folderIcon from "./agent-icons/folder.svg";
import horizonIcon from "./agent-icons/horizon.svg";
import ideIcon from "./agent-icons/ide.svg";
import identityIcon from "./agent-icons/identity.svg";
import libraryIcon from "./agent-icons/library.svg";
import lunaIcon from "./agent-icons/luna.svg";
import peaksIcon from "./agent-icons/peaks.svg";
import portalIcon from "./agent-icons/portal.svg";
import pulseIcon from "./agent-icons/pulse.svg";
import resonanceIcon from "./agent-icons/resonance.svg";
import sentinelIcon from "./agent-icons/sentinel.svg";
import solIcon from "./agent-icons/sol.svg";
import sparkIcon from "./agent-icons/spark.svg";
import spectrumIcon from "./agent-icons/spectrum.svg";
import statueIcon from "./agent-icons/statue.svg";
import stratusIcon from "./agent-icons/stratus.svg";
import terminalIcon from "./agent-icons/terminal.svg";
import waveIcon from "./agent-icons/wave.svg";

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

export const AGENT_ICON_NAMES = [
  "folder",
  "chat",
  "wave",
  "focus",
  "library",
  "coder",
  "canvas",
  "ide",
  "fast",
  "peaks",
  "flux",
  "pulse",
  "spark",
  "horizon",
  "emit",
  "database",
  "stratus",
  "sentinel",
  "identity",
  "spectrum",
  "chime",
  "sol",
  "atlas",
  "chronos",
  "statue",
  "portal",
  "resonance",
  "luna",
  "cortex",
  "terminal",
] as const;

const IconMap: Record<(typeof AGENT_ICON_NAMES)[number], string> = {
  folder: folderIcon,
  chat: chatIcon,
  wave: waveIcon,
  focus: focusIcon,
  library: libraryIcon,
  coder: coderIcon,
  canvas: canvasIcon,
  ide: ideIcon,
  fast: fastIcon,
  peaks: peaksIcon,
  flux: fluxIcon,
  pulse: pulseIcon,
  spark: sparkIcon,
  horizon: horizonIcon,
  emit: emitIcon,
  database: databaseIcon,
  stratus: stratusIcon,
  sentinel: sentinelIcon,
  identity: identityIcon,
  spectrum: spectrumIcon,
  chime: chimeIcon,
  sol: solIcon,
  atlas: atlasIcon,
  chronos: chronosIcon,
  statue: statueIcon,
  portal: portalIcon,
  resonance: resonanceIcon,
  luna: lunaIcon,
  cortex: cortexIcon,
  terminal: terminalIcon,
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
    const iconUrl = IconMap[name as keyof typeof IconMap];
    if (iconUrl) {
      return renderIconImage(iconUrl, props?.icon, "builtin");
    }
    return renderIconImage(defaultIcon, props?.icon, "default");
  }, [icon, props?.avatar, props?.icon, type]);
  return render();
};
