import React, { useCallback, useEffect, useRef } from "react";
import { registerAgentPointer } from "./agentPointerRuntime";
import { supportsAgentPointer } from "./agentPointerModel";
import type { AvatarProps } from "antd/es";
import { AgentDefaultPose } from "./AgentDefaultPose";
import styles from "./AgentCharacter.module.css";
import { AGENT_ICON_NAMES, isExternalAgentIcon, normalizeAgentIconName, resolveAgentIcon, type AgentIconConfig } from "./agentAppearance";
export { AGENT_ICON_NAMES };

interface AgentIconProps {
  icon?: AgentIconConfig;
  mode?: string;
  interactive?: boolean;
  type: "agent";
  props?: { icon?: React.SVGProps<SVGSVGElement>; avatar?: AvatarProps };
}
export const AgentIcon: React.FC<AgentIconProps> = ({ icon, mode, props, interactive = true }) => {
  const svg = props?.icon || {};
  const element = useRef<SVGSVGElement | null>(null);
  const appearance = resolveAgentIcon(icon, mode);
  const external = isExternalAgentIcon(icon);
  const setElement = useCallback((node: SVGSVGElement | null) => {
    element.current = node;
    if (typeof svg.ref === "function") svg.ref(node);
    else if (svg.ref && typeof svg.ref === "object") (svg.ref as React.MutableRefObject<SVGSVGElement | null>).current = node;
  }, [svg.ref]);
  useEffect(() => {
    if (!interactive || external || !element.current || !supportsAgentPointer(appearance.name)) return;
    return registerAgentPointer(element.current, appearance.name);
  }, [appearance.name, external, interactive]);
  const size = typeof props?.avatar?.size === "number" ? props.avatar.size : 32;
  const width = svg.width || size;
  const height = svg.height || size;
  if (isExternalAgentIcon(icon)) {
    const image = svg as React.ImgHTMLAttributes<HTMLImageElement>;
    return <img {...image} src={icon.trim()} alt="" data-agent-icon-source="external"
      style={{ width: width as number, height: height as number, borderRadius: 8, objectFit: "cover", ...svg.style }} />;
  }
  const variants = { general: "general", coder: "code", kbase: "knowledge", team: "team", executor: "executor", proxy: "agent" } as const;
  const configuredName = typeof icon === "string" ? icon : icon?.name;
  return <svg {...svg} ref={setElement} data-agent-pointer-disabled={interactive ? undefined : "true"} className={[styles.avatar, svg.className].filter(Boolean).join(" ")} data-agent-avatar="" width={width as number} height={height as number} viewBox="20 35 160 145" fill="currentColor"
    aria-hidden={svg["aria-label"] ? undefined : true} focusable="false"
    data-agent-icon-source={normalizeAgentIconName(configuredName) ? "builtin" : "default"}
    data-agent-icon-name={appearance.name}
    style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...(appearance.color ? { color: appearance.color } : {}), ...svg.style }}>
    <ellipse data-agent-shadow="" className={styles.avatarShadow} cx="100" cy={appearance.name === "team" ? 172 : 162} rx="56" ry={appearance.name === "team" ? 6 : 9} fill="currentColor" />
    <g data-agent-motion="" className={styles.avatarMotion}><g data-agent-spin="" className={styles.avatarMotion}><AgentDefaultPose key={appearance.name} variant={variants[appearance.name]} /></g></g>
  </svg>;
};
