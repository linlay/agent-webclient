import React from "react";
import type { AvatarProps } from "antd/es";
import { AgentCharacter } from "./AgentCharacterGlyph";
import styles from "./AgentCharacter.module.css";
import { AGENT_ICON_NAMES, isExternalAgentIcon, normalizeAgentIconName, resolveAgentIcon, type AgentIconConfig } from "./agentAppearance";
export { AGENT_ICON_NAMES };

interface AgentIconProps {
  icon?: AgentIconConfig;
  mode?: string;
  type: "agent";
  props?: { icon?: React.SVGProps<SVGSVGElement>; avatar?: AvatarProps };
}
export const AgentIcon: React.FC<AgentIconProps> = ({ icon, mode, props }) => {
  const svg = props?.icon || {};
  const size = typeof props?.avatar?.size === "number" ? props.avatar.size : 32;
  const width = svg.width || size;
  const height = svg.height || size;
  if (isExternalAgentIcon(icon)) {
    const image = svg as React.ImgHTMLAttributes<HTMLImageElement>;
    return <img {...image} src={icon.trim()} alt="" data-agent-icon-source="external"
      style={{ width: width as number, height: height as number, borderRadius: 8, objectFit: "cover", ...svg.style }} />;
  }
  const appearance = resolveAgentIcon(icon, mode);
  const variants = { general: "general", coder: "code", kbase: "knowledge", team: "team", executor: "executor", proxy: "agent" } as const;
  const configuredName = typeof icon === "string" ? icon : icon?.name;
  return <svg {...svg} className={[styles.avatar, svg.className].filter(Boolean).join(" ")} data-agent-avatar="" width={width as number} height={height as number} viewBox="20 35 160 145" fill="currentColor"
    aria-hidden={svg["aria-label"] ? undefined : true} focusable="false"
    data-agent-icon-source={normalizeAgentIconName(configuredName) ? "builtin" : "default"}
    data-agent-icon-name={appearance.name}
    style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...(appearance.color ? { color: appearance.color } : {}), ...svg.style }}>
    <ellipse className={styles.avatarShadow} cx="100" cy={appearance.name === "team" ? 172 : 162} rx="62" ry="14" fill="currentColor" />
    <g className={styles.avatarMotion}><AgentCharacter variant={variants[appearance.name]} /></g>
  </svg>;
};
