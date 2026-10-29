import type { RunActivityVariant } from "./agentCharacterState";

export const AGENT_IDLE_MOTIONS = ["turn", "look", "doze", "stretch"] as const;
export const AGENT_WORK_MOTIONS = ["focus", "compare", "hop", "idea"] as const;
export type AgentIdleMotion = typeof AGENT_IDLE_MOTIONS[number];
export type AgentWorkMotion = typeof AGENT_WORK_MOTIONS[number];
export type AgentMotion = AgentIdleMotion | AgentWorkMotion;
export const AGENT_POINTER_REST_MS = 1500;
export const AGENT_DOZE_AFTER_MS = 60_000;

export function chooseAgentMotion<T extends AgentMotion>(choices: readonly T[], previous?: T, random = Math.random): T {
  const available = choices.filter(item => item !== previous);
  const pool = available.length ? available : choices;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
export function chooseAgentIdleMotion(previous: AgentIdleMotion | undefined, idleMs: number, random = Math.random): AgentIdleMotion {
  return chooseAgentMotion(AGENT_IDLE_MOTIONS.filter(item => item !== "doze" || idleMs >= AGENT_DOZE_AFTER_MS), previous, random);
}

type TransformPose = readonly [number, number?, number?, number?, number?, number?];
const rest: TransformPose = [0, 0, 0, 0, 1, 1];
const end: TransformPose = [1, 0, 0, 0, 1, 1];
const BODY: Record<AgentMotion, readonly TransformPose[]> = {
  turn: [rest, [.14, 0, 0, -3], [.24, 0, 3, -4, 1.04, .9], [.4, 0, 0, 4], [.66, 0, 2, 3, 1.03, .93], [.8, 0, 0, -3], end],
  look: [rest, [.13], [.3, -3, 3, -4, 1, .96], [.49, -3, 3, -4, 1, .96], [.73, 3, 3, 4, 1, .96], [.86, 3, 3, 4, 1, .96], end],
  doze: [rest, [.2], [.48, 0, 10, 8, 1.03, .95], [.73, 0, 10, 8, 1.03, .95], [.88, 0, 3, -1], end],
  stretch: [rest, [.14, 0, 4, 2, 1.1, .84], [.32, 0, 1, 1, .91, 1.08], [.6, 0, 1, 1, .91, 1.08], [.8, 0, 3, 2, 1.04, .95], end],
  focus: [rest, [.18], [.35, 0, 8, 5, 1.05, .94], [.7, 0, 8, 5, 1.05, .94], [.86, 0, 3, 1], end],
  compare: [rest, [.19], [.36, -3, 4, -4, 1, .95], [.53, -3, 4, -4, 1, .95], [.74, 3, 4, 5, 1, .95], [.86, 3, 4, 5, 1, .95], end],
  hop: [rest, [.14], [.25, 0, 2, 0, 1.09, .8], [.35, 0, 0, 0, .96, 1.03], [.5, 0, -5, 0, .98, .99], [.64, 0, 0, 0, .96, 1.03], [.71, 0, 2, 0, 1.09, .8], [.82, 0, -4, 0, .98, 1.01], end],
  idea: [rest, [.23, 0, 3, 2, 1.03, .96], [.31, 0, 0, 3, .98, 1.01], [.6, 0, 0, 3, .98, 1.01], [.8, 0, 3, 1], end],
};
const GAZE: Partial<Record<AgentMotion, readonly (readonly [number, number, number])[]>> = {
  turn: [[0, 0, 0], [.12, 7, 0], [.23, 8, 0], [.4, 0, 0], [.7, -5, 0], [1, 0, 0]],
  look: [[0, 0, 0], [.14, -13, 0], [.43, -13, 0], [.62, 13, 0], [.8, 13, 0], [1, 0, 0]],
  focus: [[0, 0, 0], [.14, 2, 8], [.7, 2, 8], [.84, 0, 1], [1, 0, 0]],
  compare: [[0, 0, 0], [.15, -12, 5], [.48, -12, 5], [.66, 12, 5], [.84, 12, 5], [1, 0, 0]],
  idea: [[0, 0, 2], [.2, 0, 2], [.31, 0, -2], [.7, 0, -2], [1, 0, 0]],
};

export interface AgentMotionPlayback { duration: number; cancel(): void }
/** Finite, seekable SVG tracks. Pointer and activity schedulers own their separate clocks. */
export function playAgentMotion(root: SVGSVGElement, motion: AgentMotion, variant: RunActivityVariant): AgentMotionPlayback {
  const duration = motion === "turn" ? 2600 : motion === "doze" ? 3600 : 2800;
  const animations: Animation[] = [];
  const originStyles = new Map<SVGElement, string>();
  const origin = (element: SVGElement, value: string) => {
    if (!originStyles.has(element)) originStyles.set(element, element.style.transformOrigin);
    element.style.transformOrigin = value;
  };
  const animate = (element: SVGElement | null, frames: Keyframe[]) => {
    if (!element?.animate) return;
    animations.push(element.animate(frames.map(frame => ({ easing: "cubic-bezier(.2,.65,.3,1)", ...frame })), {
      duration, iterations: 1, fill: "none", easing: "linear",
    }));
  };
  const body = root.querySelector<SVGGElement>("[data-agent-motion]");
  const spin = root.querySelector<SVGGElement>("[data-agent-spin]");
  // Wider silhouettes have less horizontal clearance in the same immutable viewBox.
  const strength = variant === "team" ? .18 : variant === "code" ? .35 : variant === "knowledge" ? .55 : variant === "executor" ? .55 : 1;
  if (body) {
    origin(body, motion === "hop" ? "100px 148px" : variant === "team" ? "100px 76px" : "100px 100px");
    animate(body, BODY[motion].map(([offset, x = 0, y = 0, angle = 0, sx = 1, sy = 1]) => {
      const narrow = variant === "team" || variant === "code";
      const horizontal = variant === "team" ? 0 : x * strength;
      const vertical = y * strength * (variant === "code" && y < 0 ? .4 : 1);
      const tilt = angle * (variant === "team" ? .02 : variant === "code" ? .15 : strength);
      const scaleX = 1 + ((narrow ? Math.min(1, sx) : sx) - 1) * strength;
      const scaleY = 1 + ((variant === "code" ? Math.min(1.03, sy) : sy) - 1) * strength;
      return { offset, transform: `translate(${horizontal}px,${vertical}px) rotate(${tilt}deg) scale(${scaleX},${scaleY})` };
    }));
  }
  for (const gaze of root.querySelectorAll<SVGGElement>("[data-agent-gaze]")) {
    // Companion eyes stay attached to their small faces while the main face leads.
    const gazeStrength = variant === "team" ? .45 : 1;
    if (GAZE[motion]) animate(gaze, GAZE[motion]!.map(([offset, x, y]) => ({ offset, transform: `translate(${x * gazeStrength}px,${y * gazeStrength}px)` })));
    const eyes = gaze.querySelector<SVGGElement>("[data-agent-eyes]");
    const lids: readonly (readonly [number, string])[] = motion === "doze"
      ? [[0, "scaleY(1)"], [.2, "scaleY(.55)"], [.45, "scaleY(.08)"], [.76, "scaleY(.08)"], [.86, "scaleY(1.2)"], [1, "scaleY(1)"]]
      : motion === "stretch" ? [[0, "scaleY(1)"], [.13, "scaleY(.55)"], [.6, "scaleY(.55)"], [.8, "scaleY(1.12)"], [1, "scaleY(1)"]]
      : motion === "focus" || motion === "compare" ? [[0, "scaleY(1)"], [.2, "scaleY(.62)"], [.7, "scaleY(.62)"], [1, "scaleY(1)"]]
      : motion === "idea" ? [[0, "scale(1)"], [.14, "scale(1,.65)"], [.23, "scale(1,.65)"], [.275, "scale(1.25,1.8)"], [.59, "scale(1.25,1.8)"], [.74, "scale(1.08,1.2)"], [1, "scale(1)"]]
      : [[0, "scaleY(1)"], [.06, "scaleY(1)"], [.11, "scaleY(.12)"], [.16, "scaleY(1)"], [1, "scaleY(1)"]];
    animate(eyes || null, lids.map(([offset, transform]) => ({ offset, transform })));
  }
  const faces = root.querySelectorAll<SVGGElement>("[data-agent-face]");
  if (motion === "turn" && spin) {
    const rotations = [[0, 0], [.22, 0], [.34, 40], [.44, 180], [.56, 300], [.68, 372], [.82, 356], [1, 360]];
    const rotation: Keyframe[] = [], opacity: Keyframe[] = [];
    for (let i = 0; i < rotations.length - 1; i++) {
      const [start, from] = rotations[i], [endAt, to] = rotations[i + 1];
      for (let step = 0; step < 10; step++) {
        const angle = from + (to - from) * step / 10, offset = start + (endAt - start) * step / 10;
        rotation.push({ offset, transform: `scaleX(${Math.cos(angle * Math.PI / 180)})`, easing: "linear" });
        opacity.push({ offset, opacity: angle > 85 && angle < 275 ? 0 : 1, easing: "steps(1,end)" });
      }
    }
    rotation.push({ offset: 1, transform: "scaleX(1)" }); opacity.push({ offset: 1, opacity: 1 });
    animate(spin, rotation); faces.forEach(face => animate(face, opacity));
  }
  for (const face of faces) {
    if (face.dataset.agentFace === "companion") continue;
    const mouth = face.querySelector<SVGElement>("[data-agent-mouth]");
    if (motion === "doze" && mouth) {
      origin(mouth, "center");
      animate(mouth, [[0, "scale(1)"], [.25, "scale(1)"], [.5, "scale(1.3,2.2)"], [.72, "scale(1.3,2.2)"], [.87, "scale(1)"], [1, "scale(1)"]].map(([offset, transform]) => ({ offset: Number(offset), transform: String(transform) })));
    }
    if (motion === "idea") {
      const smile = face.querySelector<SVGElement>("[data-agent-smile]");
      const visibility: Keyframe[] = [{ offset: 0, opacity: 0 }, { offset: .28, opacity: 0 }, { offset: .4, opacity: 1 }, { offset: .78, opacity: 1 }, { offset: 1, opacity: 0 }];
      animate(smile, visibility);
      animate(mouth, visibility.map(frame => ({ ...frame, opacity: 1 - Number(frame.opacity) })));
    }
  }
  const shadow = root.querySelector<SVGEllipseElement>("[data-agent-shadow]");
  if (motion === "hop") animate(shadow, [[0, 1], [.25, 1.1], [.5, .66], [.71, 1.12], [1, 1]].map(([offset, size]) => ({ offset, transform: `scaleX(${size})` })));
  root.dataset.agentAction = motion;
  if (animations.length) animations[0].onfinish = () => { if (root.dataset.agentAction === motion) delete root.dataset.agentAction; };
  return { duration, cancel() {
    animations.forEach(animation => { animation.onfinish = null; animation.cancel(); });
    originStyles.forEach((value, element) => { element.style.transformOrigin = value; });
    delete root.dataset.agentAction;
  } };
}
