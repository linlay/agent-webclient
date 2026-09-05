import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { useI18n } from "@/shared/i18n";
import {
	clearDisplay,
	getActiveDisplay,
	subscribeDisplay,
	type DisplayEffect,
} from "@/features/display/lib/displayRuntime";
import "./DisplayOverlay.module.css";

type Particle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	maxLife: number;
	size: number;
	color: string;
	phase: number;
};

const FIREWORK_COLORS = ["#ff5d73", "#ffd166", "#52d9ff", "#a78bfa", "#7cff8a"];
const NATIONAL_COLORS = ["#ffdc73", "#ffd24a", "#ffefb0", "#e33a2f"];

function random(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

function drawStar(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
): void {
	context.beginPath();
	for (let point = 0; point < 10; point += 1) {
		const angle = -Math.PI / 2 + point * Math.PI / 5;
		const length = point % 2 === 0 ? radius : radius * 0.42;
		const nextX = x + Math.cos(angle) * length;
		const nextY = y + Math.sin(angle) * length;
		if (point === 0) context.moveTo(nextX, nextY);
		else context.lineTo(nextX, nextY);
	}
	context.closePath();
	context.fill();
}

function createFallingParticle(
	effect: Exclude<DisplayEffect, "fireworks">,
	width: number,
	height: number,
): Particle {
	const nationalDay = effect === "nationalDay";
	return {
		x: random(0, width),
		y: random(-height * 0.25, 0),
		vx: random(-0.28, 0.32),
		vy: nationalDay ? random(0.35, 0.9) : random(0.45, 1.35),
		life: Number.POSITIVE_INFINITY,
		maxLife: 1,
		size: nationalDay ? random(4, 9) : random(1.5, 4.5),
		color: nationalDay
			? NATIONAL_COLORS[Math.floor(random(0, NATIONAL_COLORS.length))]
			: "#ffffff",
		phase: random(0, Math.PI * 2),
	};
}

export const DisplayOverlay: React.FC = () => {
	const active = useSyncExternalStore(subscribeDisplay, getActiveDisplay, () => null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const { t } = useI18n();

	useEffect(() => {
		if (!active) return undefined;
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context) return undefined;
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		let width = 0;
		let height = 0;
		let animationFrame = 0;
		let previousTime = performance.now();
		let lastBurst = -1_000;
		const particles: Particle[] = [];

		const resize = () => {
			const ratio = Math.min(window.devicePixelRatio || 1, 2);
			width = window.innerWidth;
			height = window.innerHeight;
			canvas.width = Math.max(1, Math.floor(width * ratio));
			canvas.height = Math.max(1, Math.floor(height * ratio));
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
		};

		const addBurst = () => {
			const x = random(width * 0.15, width * 0.85);
			const y = random(height * 0.12, height * 0.58);
			const color = FIREWORK_COLORS[Math.floor(random(0, FIREWORK_COLORS.length))];
			for (let index = 0; index < 54; index += 1) {
				const angle = random(0, Math.PI * 2);
				const speed = random(0.8, 3.8);
				particles.push({
					x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
					life: random(700, 1_450), maxLife: 1_450, size: random(1.4, 3.2), color, phase: 0,
				});
			}
		};

		resize();
		if (!reducedMotion && active.effect !== "fireworks") {
			for (let index = 0; index < (active.effect === "snowfall" ? 90 : 46); index += 1) {
				const particle = createFallingParticle(active.effect, width, height);
				particle.y = random(0, height);
				particles.push(particle);
			}
		}

		const render = (now: number) => {
			const delta = Math.min(32, now - previousTime);
			previousTime = now;
			context.clearRect(0, 0, width, height);
			if (active.effect === "fireworks" && now - lastBurst > 650) {
				addBurst();
				lastBurst = now;
			}
			if (active.effect === "nationalDay") {
				for (let ribbon = 0; ribbon < 4; ribbon += 1) {
					context.strokeStyle = ribbon % 2 === 0 ? "rgba(208,25,31,.72)" : "rgba(255,210,74,.64)";
					context.lineWidth = 8 + ribbon * 2;
					context.beginPath();
					context.moveTo(-20, height * (0.18 + ribbon * 0.2));
					context.bezierCurveTo(width * 0.32, height * (0.05 + ribbon * 0.2), width * 0.68, height * (0.35 + ribbon * 0.12), width + 20, height * (0.18 + ribbon * 0.2));
					context.stroke();
				}
			}
			for (let index = particles.length - 1; index >= 0; index -= 1) {
				const particle = particles[index];
				if (active.effect === "fireworks") {
					particle.life -= delta;
					particle.vy += 0.0024 * delta;
					particle.x += particle.vx * delta * 0.06;
					particle.y += particle.vy * delta * 0.06;
					if (particle.life <= 0) {
						particles.splice(index, 1);
						continue;
					}
					context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
					context.fillStyle = particle.color;
					context.beginPath();
					context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
					context.fill();
				} else {
					particle.phase += delta * 0.0014;
					particle.x += (particle.vx + Math.sin(particle.phase) * 0.3) * delta * 0.06;
					particle.y += particle.vy * delta * 0.06;
					if (particle.y > height + 15) {
						Object.assign(particle, createFallingParticle(active.effect, width, height));
					}
					context.globalAlpha = active.effect === "snowfall" ? 0.9 : 0.94;
					context.fillStyle = particle.color;
					if (active.effect === "snowfall") {
						context.beginPath();
						context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
						context.fill();
					} else {
						drawStar(context, particle.x, particle.y, particle.size);
					}
				}
			}
			context.globalAlpha = 1;
			animationFrame = window.requestAnimationFrame(render);
		};

		window.addEventListener("resize", resize);
		if (!reducedMotion) animationFrame = window.requestAnimationFrame(render);
		const timer = window.setTimeout(() => clearDisplay(active.token), active.durationMs);
		return () => {
			window.clearTimeout(timer);
			window.cancelAnimationFrame(animationFrame);
			window.removeEventListener("resize", resize);
			context.clearRect(0, 0, width, height);
		};
	}, [active]);

	if (!active) return null;
	return (
		<div
			className={`desktop-display-overlay is-${active.effect}`}
			style={{ "--desktop-display-duration": `${active.durationMs}ms` } as React.CSSProperties}
			aria-hidden="true"
		>
			<canvas ref={canvasRef} />
			{active.effect === "nationalDay" ? (
				<div className="desktop-display-national-greeting">{t("display.nationalDayGreeting")}</div>
			) : null}
			<div className="desktop-display-static-decoration" />
		</div>
	);
};
