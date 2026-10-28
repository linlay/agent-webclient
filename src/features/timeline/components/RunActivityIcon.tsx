import React, { useEffect, useRef } from "react";
import { AgentDefaultPose } from "@/shared/icons/AgentDefaultPose";
import { AGENT_WORK_MOTIONS, chooseAgentMotion, playAgentMotion, type AgentMotionPlayback, type AgentWorkMotion } from "@/shared/icons/agentMotion";
import type { RunActivityAppearance } from "../lib/runActivityAppearance";
import styles from "@/shared/icons/AgentCharacter.module.css";

export interface RunActivityIconProps extends Partial<RunActivityAppearance> {
  /** Optional fixed working motion for previews. Live activities choose only the four work tracks. */
  motion?: AgentWorkMotion;
  animated?: boolean;
  cycleDurationMs?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** Each activity owns one independent work clock and never joins the pointer/idle runtime. */
export function RunActivityIcon({ variant = "general", color, motion, animated = true,
  cycleDurationMs = 12000, className, style }: RunActivityIconProps) {
  const element = useRef<SVGSVGElement>(null);
  const interval = Number.isFinite(cycleDurationMs) ? Math.max(4000, cycleDurationMs) : 12000;
  useEffect(() => {
    const svg = element.current;
    if (!svg) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let playback: AgentMotionPlayback | undefined;
    let current: AgentWorkMotion = motion || "focus";
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let disposed = false;
    const stop = () => { clearTimeout(timer); playback?.cancel(); playback = undefined; };
    const start = () => {
      stop();
      if (disposed || !animated || preference?.matches || document.hidden) return;
      svg.dataset.workMotion = current;
      playback = playAgentMotion(svg, current, variant);
      timer = setTimeout(() => {
        current = motion || chooseAgentMotion(AGENT_WORK_MOTIONS, current);
        start();
      }, interval + Math.random() * 4000);
    };
    start();
    preference?.addEventListener("change", start);
    document.addEventListener("visibilitychange", start);
    return () => {
      disposed = true; stop();
      preference?.removeEventListener("change", start);
      document.removeEventListener("visibilitychange", start);
    };
  }, [variant, motion, animated, interval]);

  return <span className={[styles.icon, className].filter(Boolean).join(" ")}
    style={{ ...style, ...(color ? { color } : {}) }} aria-hidden="true"
    data-run-activity-icon="" data-variant={variant} data-animated={animated}>
    <svg ref={element} viewBox="20 35 160 145" fill="currentColor" focusable="false" data-work-motion={motion || "focus"}>
      <ellipse data-agent-shadow="" className={styles.avatarShadow} cx="100" cy={variant === "team" ? 172 : 162}
        rx="56" ry={variant === "team" ? 6 : 9} fill="currentColor" />
      <g data-agent-motion="" className={styles.avatarMotion}>
        <g data-agent-spin="" className={styles.avatarMotion}><AgentDefaultPose variant={variant} /></g>
      </g>
    </svg>
  </span>;
}
