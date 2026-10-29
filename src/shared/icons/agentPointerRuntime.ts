import { AGENT_POINTER_REST_MS, chooseAgentIdleMotion, playAgentMotion, type AgentIdleMotion, type AgentMotionPlayback } from "./agentMotion";
import { agentPointerTarget, POINTER_AGENT_PROFILES, type AgentPointerMood, type PointerAgentName } from "./agentPointerModel";

interface EyeShape {
  element: SVGRectElement; x: number; y: number; width: number; height: number; radius: string | null;
  currentWidth: number; currentHeight: number;
}
interface Eye {
  gaze: SVGGElement; blink: SVGGElement; shapes: EyeShape[]; x: number; y: number;
}
interface Actor {
  root: SVGSVGElement; name: PointerAgentName; motion: SVGGElement; shadow: SVGEllipseElement | null;
  group: Element; surface: Element | null; eyes: Eye[]; sizeTargets: Element[];
  visible: boolean; width: number; cx: number; cy: number; angle: number; lift: number;
  idleAt: number; idleSince: number; lastIdle?: AgentIdleMotion; idlePlayback?: AgentMotionPlayback; following: boolean;
  settled: boolean; near: boolean; pulseUntil: number; blinkAt: number; blinkStart: number;
}
const runtimes = new WeakMap<Document, AgentPointerRuntime>();
const number = (element: Element, key: string) => Number(element.getAttribute(key));
const approach = (current: number, target: number, factor: number) => current + (target - current) * factor;

/** One document listener set and one RAF, shared by all visible resting avatars. */
class AgentPointerRuntime {
  private actors = new Set<Actor>();
  private frame: number | null = null;
  private dirty = true;
  private idleTimer: number | undefined;
  private pointer = { x: 0, y: 0, inside: false, target: null as Node | null, movedAt: 0 };
  private focus: Node | null = null;
  private focusAt = 0;
  private previousFrame = 0;
  private readonly preference: MediaQueryList | undefined;
  private readonly observer: IntersectionObserver | undefined;
  private readonly win: Window;
  private readonly sizes: ResizeObserver | undefined;
  private readonly sizeReferences = new Map<Element, number>();

  constructor(private readonly doc: Document) {
    this.win = doc.defaultView!;
    this.preference = this.win.matchMedia?.("(prefers-reduced-motion: reduce)");
    const Observer = (this.win as Window & { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
    if (Observer) this.observer = new Observer(entries => {
      for (const entry of entries) for (const actor of this.actors) {
        if (actor.root === entry.target) {
          actor.visible = entry.isIntersecting;
          if (!actor.visible) { actor.idleAt = Infinity; this.restore(actor); }
          else actor.idleAt = this.now() + this.idleGap();
        }
      }
      this.dirty = true; this.start(); this.scheduleIdle();
    });
    const Sizes = (this.win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (Sizes) this.sizes = new Sizes(this.onLayout);
    doc.addEventListener("pointermove", this.onMove, { passive: true });
    doc.addEventListener("pointerdown", this.onTouch, { passive: true });
    doc.addEventListener("pointerout", this.onPointerOut);
    doc.addEventListener("focusin", this.onFocus);
    doc.addEventListener("focusout", this.onFocus);
    doc.addEventListener("visibilitychange", this.onSuspend);
    this.win.addEventListener("blur", this.onSuspend);
    this.win.addEventListener("scroll", this.onLayout, { capture: true, passive: true });
    this.win.addEventListener("resize", this.onLayout, { passive: true });
    this.preference?.addEventListener("change", this.onSuspend);
  }

  add(root: SVGSVGElement, name: PointerAgentName): () => void {
    const motion = root.querySelector<SVGGElement>("[data-agent-motion]");
    const eyes = Array.from(root.querySelectorAll<SVGGElement>("[data-agent-gaze]")).flatMap(gaze => {
      const blink = gaze.querySelector<SVGGElement>("[data-agent-blink]");
      if (!blink) return [];
      return [{ gaze, blink, x: 0, y: 0, shapes: Array.from(blink.querySelectorAll<SVGRectElement>("rect")).map(element => ({
        element, x: number(element, "x"), y: number(element, "y"),
        width: number(element, "width"), height: number(element, "height"), radius: element.getAttribute("rx"),
        currentWidth: number(element, "width"), currentHeight: number(element, "height"),
      })) }];
    });
    if (!motion || !eyes.length) return () => undefined;
    const actor: Actor = {
      root, name, motion, eyes, sizeTargets: [], shadow: root.querySelector("[data-agent-shadow]"),
      group: root.closest("[data-agent-identity]") || root,
      surface: root.closest("[data-agent-pointer-surface]"),
      visible: !this.observer, width: 0, cx: 0, cy: 0, angle: 0, lift: 0,
      idleAt: this.now() + this.idleGap(), idleSince: this.now(), following: false,
      settled: true, near: false, pulseUntil: 0, blinkAt: this.now() + 1800 + Math.random() * 2500, blinkStart: -1,
    };
    root.dataset.pointerTracking = "true";
    root.dataset.pointerMood = "rest";
    root.dataset.pointerResting = "true";
    this.actors.add(actor); this.observer?.observe(root); this.dirty = true; this.scheduleIdle();
    actor.sizeTargets = Array.from(new Set([root, actor.group, ...(actor.surface ? [actor.surface] : [])]));
    for (const target of actor.sizeTargets) {
      const references = this.sizeReferences.get(target) || 0;
      if (!references) this.sizes?.observe(target);
      this.sizeReferences.set(target, references + 1);
    }
    return () => {
      this.observer?.unobserve(root); this.actors.delete(actor); this.restore(actor);
      for (const target of actor.sizeTargets) {
        const references = (this.sizeReferences.get(target) || 1) - 1;
        if (!references) { this.sizes?.unobserve(target); this.sizeReferences.delete(target); }
        else this.sizeReferences.set(target, references);
      }
      delete root.dataset.pointerTracking; delete root.dataset.pointerMood; delete root.dataset.pointerResting;
      if (this.actors.size) this.scheduleIdle();
      if (!this.actors.size) this.destroy();
    };
  }

  private idleGap = () => 8000 + Math.random() * 8000;
  private scheduleIdle = () => {
    this.win.clearTimeout(this.idleTimer); this.idleTimer = undefined;
    if (this.doc.hidden || this.preference?.matches) return;
    const deadline = Math.min(...Array.from(this.actors).filter(actor => actor.visible && !actor.following).map(actor => actor.idleAt));
    if (!Number.isFinite(deadline)) return;
    this.idleTimer = this.win.setTimeout(() => {
      const now = this.now();
      for (const actor of this.actors) {
        if (!actor.visible || actor.following || actor.idleAt > now) continue;
        this.restore(actor);
        const motion = chooseAgentIdleMotion(actor.lastIdle, now - Math.max(actor.idleSince, this.pointer.movedAt));
        const variants = { general: "general", coder: "code", kbase: "knowledge", team: "team", proxy: "agent", executor: "executor" } as const;
        actor.lastIdle = motion;
        actor.idlePlayback = playAgentMotion(actor.root, motion, variants[actor.name]);
        actor.idleAt = now + actor.idlePlayback.duration + this.idleGap();
      }
      this.scheduleIdle();
    }, Math.max(0, deadline - this.now()));
  };
  private now = () => this.win.performance.now();
  private start = () => {
    if (this.frame === null && !this.doc.hidden && !this.preference?.matches && this.actors.size) {
      this.frame = this.win.requestAnimationFrame(this.draw);
    }
  };
  private onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    this.focus = null;
    this.pointer = { x: event.clientX, y: event.clientY, target: event.target as Node, inside: true, movedAt: this.now() };
    this.start();
  };
  private onTouch = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || this.preference?.matches) return;
    this.focus = null;
    this.pointer = { x: event.clientX, y: event.clientY, target: null, inside: false, movedAt: this.now() };
    for (const actor of this.actors) if (actor.group.contains(event.target as Node)) actor.pulseUntil = this.now() + 900;
    this.start();
  };
  private onPointerOut = (event: PointerEvent) => {
    if (event.relatedTarget !== null) return;
    this.pointer.inside = false; this.pointer.target = null;
    for (const actor of this.actors) actor.pulseUntil = 0;
    this.start();
  };
  private onFocus = (event: FocusEvent) => {
    this.focus = event.type === "focusin" ? event.target as Node : event.relatedTarget as Node | null;
    this.focusAt = this.now();
    this.start();
  };
  private onLayout = () => { this.dirty = true; if (this.pointer.inside || this.focus) this.start(); };
  private onSuspend = () => {
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    this.frame = null; this.previousFrame = 0;
    this.pointer.inside = false; this.pointer.target = null; this.focus = null;
    this.win.clearTimeout(this.idleTimer); this.idleTimer = undefined;
    this.dirty = true;
    for (const actor of this.actors) { actor.following = false; actor.idleAt = this.now() + this.idleGap(); actor.near = false; actor.pulseUntil = 0; this.restore(actor); }
    this.scheduleIdle();
  };
  private restore(actor: Actor) {
    actor.idlePlayback?.cancel(); actor.idlePlayback = undefined;
    for (const eye of actor.eyes) {
      eye.x = 0; eye.y = 0; eye.gaze.removeAttribute("transform"); eye.blink.style.removeProperty("transform");
      for (const shape of eye.shapes) {
        shape.currentWidth = shape.width; shape.currentHeight = shape.height;
        for (const [key, value] of Object.entries({ x: shape.x, y: shape.y, width: shape.width, height: shape.height })) {
          shape.element.setAttribute(key, String(value));
        }
        if (shape.radius === null) shape.element.removeAttribute("rx");
        else shape.element.setAttribute("rx", shape.radius);
      }
    }
    actor.settled = true; actor.angle = 0; actor.lift = 0; actor.motion.style.removeProperty("transform");
    actor.shadow?.style.removeProperty("transform"); actor.shadow?.style.removeProperty("opacity");
    actor.root.dataset.pointerMood = "rest";
    actor.root.dataset.pointerResting = "true";
  }

  private draw = (now: number) => {
    this.frame = null;
    if (this.doc.hidden || this.preference?.matches) return;
    const elapsed = this.previousFrame ? Math.min(64, now - this.previousFrame) : 16.67;
    this.previousFrame = now;
    // Read layout together, only after mount/scroll/resize/visibility changes.
    if (this.dirty) {
      for (const actor of this.actors) if (actor.visible) {
        const rect = actor.root.getBoundingClientRect();
        actor.width = rect.width; actor.cx = rect.left + rect.width / 2; actor.cy = rect.top + rect.height * .43;
      }
      this.dirty = false;
    }
    let keepRunning = false;
    for (const actor of this.actors) {
      if (!actor.visible || actor.width <= 0) continue;
      const profile = POINTER_AGENT_PROFILES[actor.name];
      const dx = this.pointer.x - actor.cx, dy = this.pointer.y - actor.cy;
      const distance = Math.hypot(dx, dy);
      const withinGroup = !!this.pointer.target && actor.group.contains(this.pointer.target);
      actor.surface = actor.root.closest("[data-agent-pointer-surface]");
      const withinSurface = !!this.pointer.target && !!actor.surface?.contains(this.pointer.target);
      const focused = !!this.focus && actor.group.contains(this.focus) && now - this.focusAt < AGENT_POINTER_REST_MS;
      const inside = this.pointer.inside && (actor.surface ? withinSurface : withinGroup);
      // Mouse greetings end with the containing row/surface; touch pulses have no pointer target.
      if (!inside && this.pointer.target) actor.pulseUntil = 0;
      const active = focused || now < actor.pulseUntil || (inside && now - this.pointer.movedAt < AGENT_POINTER_REST_MS);
      if (active && !actor.following) {
        this.restore(actor); actor.following = true; actor.idleAt = Infinity;
        this.scheduleIdle();
      } else if (!active && actor.following) {
        actor.following = false; actor.idleSince = now; actor.idleAt = now + this.idleGap();
        this.scheduleIdle();
      }
      if (!active && actor.settled) continue;
      actor.settled = false;
      delete actor.root.dataset.pointerResting;
      const near = active && this.pointer.inside && distance < actor.width * .2;
      if (near && !actor.near) actor.pulseUntil = now + 600;
      actor.near = near;
      const target = agentPointerTarget({ name: actor.name, dx, dy, width: actor.width, active,
        stationaryMs: now - this.pointer.movedAt, greeting: now < actor.pulseUntil, focused });
      const lag = 1 - Math.pow(1 - profile.lag, elapsed / 16.67);
      let residual = 0;
      actor.eyes.forEach((eye, index) => {
        const factor = actor.name === "team" && index < 2 ? lag * .65 : lag;
        eye.x = approach(eye.x, target.x, factor); eye.y = approach(eye.y, target.y, factor);
        eye.gaze.setAttribute("transform", `translate(${eye.x.toFixed(2)} ${eye.y.toFixed(2)})`);
        eye.shapes.forEach((shape, side) => {
          let width = shape.width, height = shape.height;
          const mood: AgentPointerMood = target.mood;
          if (mood === "round") { width = 20; height = 20; }
          if (mood === "wink" && side === 1) { width = Math.max(17, width); height = 4; }
          if (mood === "think") height *= side === 0 ? 1.08 : .72;
          if (mood === "read") height *= .82;
          if (mood === "side") height *= .8;
          shape.currentWidth = approach(shape.currentWidth, width, factor);
          shape.currentHeight = approach(shape.currentHeight, height, factor);
          shape.element.setAttribute("x", String(shape.x + (shape.width - shape.currentWidth) / 2));
          shape.element.setAttribute("y", String(shape.y + (shape.height - shape.currentHeight) / 2));
          shape.element.setAttribute("width", String(shape.currentWidth));
          shape.element.setAttribute("height", String(shape.currentHeight));
          shape.element.setAttribute("rx", String(Math.min(shape.currentWidth, shape.currentHeight) / 2));
          residual += Math.abs(shape.currentWidth - shape.width) + Math.abs(shape.currentHeight - shape.height);
        });
        if (active && now > actor.blinkAt) {
          actor.blinkStart = now; actor.blinkAt = now + 2300 + Math.random() * 2600;
        }
        const delay = actor.name === "team" && index < 2 ? (index + 1) * 65 : 0;
        const blinkTime = now - actor.blinkStart - delay;
        const blink = active && actor.blinkStart >= 0 && blinkTime >= 0 && blinkTime < 170
          ? 1 - .88 * Math.sin(blinkTime / 170 * Math.PI) : 1;
        eye.blink.style.transform = `scaleY(${blink})`;
        residual += Math.abs(eye.x) + Math.abs(eye.y);
      });
      actor.angle = approach(actor.angle, target.angle, lag); actor.lift = approach(actor.lift, target.lift, lag);
      actor.motion.style.transform = `translateY(${actor.lift.toFixed(2)}px) rotate(${actor.angle.toFixed(2)}deg)`;
      if (actor.shadow) {
        actor.shadow.style.transform = `scaleX(${1 + actor.lift * .035})`;
        actor.shadow.style.opacity = String(.18 + actor.lift * .012);
      }
      if (actor.root.dataset.pointerMood !== target.mood) actor.root.dataset.pointerMood = target.mood;
      if (active || residual + Math.abs(actor.angle) + Math.abs(actor.lift) > .04) keepRunning = true;
      else this.restore(actor);
    }
    if (keepRunning) this.start(); else this.previousFrame = 0;
  };

  private destroy() {
    this.onSuspend(); this.win.clearTimeout(this.idleTimer); this.idleTimer = undefined; this.observer?.disconnect(); this.sizes?.disconnect(); this.sizeReferences.clear();
    this.doc.removeEventListener("pointermove", this.onMove);
    this.doc.removeEventListener("pointerdown", this.onTouch);
    this.doc.removeEventListener("pointerout", this.onPointerOut);
    this.doc.removeEventListener("focusin", this.onFocus);
    this.doc.removeEventListener("focusout", this.onFocus);
    this.doc.removeEventListener("visibilitychange", this.onSuspend);
    this.win.removeEventListener("blur", this.onSuspend);
    this.win.removeEventListener("scroll", this.onLayout, true);
    this.win.removeEventListener("resize", this.onLayout);
    this.preference?.removeEventListener("change", this.onSuspend);
    runtimes.delete(this.doc);
  }
}

export function registerAgentPointer(root: SVGSVGElement, name: PointerAgentName): () => void {
  if (!root.ownerDocument.defaultView || root.closest("[data-agent-pointer-disabled]")) return () => undefined;
  let runtime = runtimes.get(root.ownerDocument);
  if (!runtime) { runtime = new AgentPointerRuntime(root.ownerDocument); runtimes.set(root.ownerDocument, runtime); }
  return runtime.add(root, name);
}
