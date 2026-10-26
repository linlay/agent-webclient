import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RunActivityFace } from "./RunActivityFace";
import {
  RUN_ACTIVITY_EXPRESSIONS,
  type RunActivityAppearance,
  type RunActivityExpression,
  type RunActivityMotion,
} from "../lib/runActivityAppearance";
import styles from "@/shared/icons/AgentCharacter.module.css";

export interface RunActivityIconProps extends Partial<RunActivityAppearance> {
  /** Optional fixed expression for previews; live activity chooses all 22 at random. */
  expression?: RunActivityExpression;
  animated?: boolean;
  cycleDurationMs?: number;
  className?: string;
  style?: React.CSSProperties;
}
interface Pose { expression: RunActivityExpression; cycle: number; gesture: number; motion: RunActivityMotion; look: number }
const SEQUENCES = new Set<RunActivityMotion>(["work", "inspect", "drowse", "persevere"]);
const MOVES: Record<RunActivityAppearance["variant"], readonly RunActivityMotion[]> = {
  general: ["peek", "tilt", "hop", "stretch"], code: ["nod", "peek", "hop"],
  knowledge: ["peek", "tilt", "nod"], team: ["hop", "nod", "shake"],
  agent: ["peek", "hop", "nod"], executor: ["nod", "peek", "hop"],
};
const motionFor = (expression: RunActivityExpression): RunActivityMotion => RUN_ACTIVITY_EXPRESSIONS.find(item => item.id === expression)!.move;
const useBrowserLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

/** A long expression clock and short gesture clock keep the character lively. */
export function RunActivityIcon({ variant = "general", color, expression, animated = true,
  cycleDurationMs = 5600, className, style }: RunActivityIconProps) {
  const duration = Number.isFinite(cycleDurationMs) ? Math.max(3000, cycleDurationMs) : 5600;
  const initial = expression || "curious";
  const [pose, setPose] = useState<Pose>({ expression: initial, cycle: 0, gesture: 0, motion: motionFor(initial), look: 1 });
  const element = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let current = expression || "curious";
    let cycle = 0, gesture = 0, motion = motionFor(current);
    let nextGesture = 0, endGestures = 0, nextCycle = 0;
    let suspendedAt: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let disposed = false;
    const beginCycle = () => {
      const now = Date.now();
      nextGesture = now + 1300 + Math.random() * 450;
      endGestures = now + duration - 1150;
      nextCycle = now + duration + 400 + Math.random() * 700;
    };
    const publish = () => setPose({ expression: current, cycle, gesture, motion, look: Math.random() < 0.5 ? -1 : 1 });
    const schedule = () => {
      if (disposed || !animated || preference?.matches || document.hidden) return;
      const deadline = nextGesture <= endGestures ? Math.min(nextGesture, nextCycle) : nextCycle;
      timer = setTimeout(() => {
        if (Date.now() >= nextCycle) {
          if (!expression) {
            const index = RUN_ACTIVITY_EXPRESSIONS.findIndex(item => item.id === current);
            current = RUN_ACTIVITY_EXPRESSIONS[(index + 1 + Math.floor(Math.random() * (RUN_ACTIVITY_EXPRESSIONS.length - 1))) % RUN_ACTIVITY_EXPRESSIONS.length].id;
          }
          cycle += 1;
          motion = motionFor(current);
          beginCycle();
        } else {
          const preferred = motionFor(current);
          const choices = (SEQUENCES.has(preferred) ? [preferred, "nod", "peek"] as const : MOVES[variant]).filter(item => item !== motion);
          motion = choices[Math.floor(Math.random() * choices.length)];
          nextGesture = Date.now() + 1250 + Math.random() * 650;
        }
        gesture += 1;
        publish();
        schedule();
      }, Math.max(0, deadline - Date.now()));
    };
    const reset = () => {
      clearTimeout(timer);
      const now = Date.now();
      if (!animated || preference?.matches || document.hidden) {
        suspendedAt ??= now;
        return;
      }
      if (suspendedAt !== undefined) {
        const elapsed = now - suspendedAt;
        nextGesture += elapsed; endGestures += elapsed; nextCycle += elapsed;
        suspendedAt = undefined;
      }
      schedule();
    };
    beginCycle(); publish(); reset();
    preference?.addEventListener("change", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      disposed = true; clearTimeout(timer);
      preference?.removeEventListener("change", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [variant, expression, animated, duration]);

  useBrowserLayoutEffect(() => {
    const group = element.current?.querySelector<SVGGElement>("[data-activity-motion]");
    if (!group) return;
    // Only restart the short gesture; its stable child keeps the expression clock.
    group.classList.remove(styles.motion);
    group.querySelectorAll(`.${styles.blink}, .${styles.gaze}`).forEach(node => node.classList.remove(styles.blink, styles.gaze));
    void group.getBoundingClientRect();
    group.classList.add(styles.motion);
    group.querySelectorAll(`.${styles.eyes}`).forEach(node => node.classList.add(styles.blink));
    if (!SEQUENCES.has(motionFor(pose.expression))) {
      group.querySelectorAll(`.${styles.features}`).forEach(node => node.classList.add(styles.gaze));
    }
  }, [pose.gesture, pose.cycle, pose.expression]);

  return <span ref={element} className={[styles.icon, className].filter(Boolean).join(" ")}
    style={{ ...style, ...(color ? { color } : {}), "--duration": `${duration}ms` } as React.CSSProperties}
    aria-hidden="true" data-run-activity-icon="" data-variant={variant} data-expression={pose.expression} data-animated={animated}>
    <svg viewBox="20 35 160 145" fill="currentColor" focusable="false">
      <g className={styles.motion} data-activity-motion="" data-gesture={pose.gesture} data-move={pose.motion}
        style={{ "--look": pose.look } as React.CSSProperties}>
        <g key={`${pose.expression}:${pose.cycle}`} className={styles["expression-cycle"]} data-sequence={motionFor(pose.expression)}>
          <RunActivityFace variant={variant} expression={pose.expression} />
        </g>
      </g>
    </svg>
  </span>;
}
