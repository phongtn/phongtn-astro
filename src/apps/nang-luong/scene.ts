import { num } from "./format";
import {
	type BrakeSetup,
	type BrakeState,
	type BrakeSummary,
	brakeStateAt,
	toKmh,
} from "./physics";

export interface Palette {
	ink: string;
	muted: string;
	line: string;
	surface: string;
	road: string;
	roadMark: string;
	vehicle: string;
	rubber: string;
	metal: string;
	skid: string;
	kinetic: string;
	brake: string;
	tires: string;
	air: string;
}

export function readPalette(el: Element): Palette {
	const css = getComputedStyle(el);
	const v = (name: string) => css.getPropertyValue(`--${name}`).trim();
	return {
		ink: v("ink"),
		muted: v("muted"),
		line: v("line"),
		surface: v("surface"),
		road: v("road"),
		roadMark: v("road-mark"),
		vehicle: v("vehicle"),
		rubber: v("rubber"),
		metal: v("metal"),
		skid: v("skid"),
		kinetic: v("kinetic"),
		brake: v("brake"),
		tires: v("tires"),
		air: v("air"),
	};
}

/** Sizes the backing store to the CSS box at the device pixel ratio; draws in CSS pixels. */
export function fitCanvas(canvas: HTMLCanvasElement) {
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const { width, height } = canvas.getBoundingClientRect();
	const w = Math.round(width * dpr);
	const h = Math.round(height * dpr);
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w;
		canvas.height = h;
	}
	const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, width, height);
	return { ctx, width, height };
}

/** 1, 2, 5, 10, 20, 50 … so that about `count` steps cover `range`. */
function niceStep(range: number, count: number) {
	const raw = range / count;
	const pow = 10 ** Math.floor(Math.log10(raw));
	const n = raw / pow;
	return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}

/* ---------- Road scene ---------- */

interface Shape {
	/** CSS px from the front of the vehicle back to its tail. */
	length: number;
	/** CSS px from the road to the top of the rider or roof. */
	height: number;
	wheelRadius: number;
	/** Wheel centres, CSS px behind the front. */
	wheels: [number, number];
	draw: (ctx: CanvasRenderingContext2D, front: number, ground: number, p: Palette) => void;
}

const SHAPES: Record<string, Shape> = {
	"xe-dap": {
		length: 66,
		height: 70,
		wheelRadius: 13,
		wheels: [13, 53],
		draw(ctx, f, g, p) {
			const rear = [f - 53, g - 13] as const;
			const front = [f - 13, g - 13] as const;
			const seat = [f - 42, g - 36] as const;
			const bar = [f - 18, g - 40] as const;
			const crank = [f - 34, g - 14] as const;
			ctx.strokeStyle = p.vehicle;
			ctx.lineWidth = 2.5;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.beginPath();
			ctx.moveTo(...rear);
			ctx.lineTo(...seat);
			ctx.lineTo(...crank);
			ctx.lineTo(...rear);
			ctx.moveTo(...seat);
			ctx.lineTo(f - 20, g - 34);
			ctx.lineTo(...crank);
			ctx.moveTo(f - 20, g - 34);
			ctx.lineTo(...front);
			ctx.moveTo(f - 20, g - 34);
			ctx.lineTo(...bar);
			ctx.stroke();
			rider(ctx, p, seat, [f - 26, g - 62], bar, crank);
		},
	},
	"xe-may": {
		length: 74,
		height: 72,
		wheelRadius: 11,
		wheels: [13, 60],
		draw(ctx, f, g, p) {
			ctx.fillStyle = p.vehicle;
			ctx.beginPath();
			ctx.moveTo(f - 66, g - 24);
			ctx.quadraticCurveTo(f - 66, g - 34, f - 54, g - 34);
			ctx.lineTo(f - 34, g - 34);
			ctx.lineTo(f - 30, g - 20);
			ctx.lineTo(f - 18, g - 20);
			ctx.lineTo(f - 12, g - 30);
			ctx.lineTo(f - 6, g - 28);
			ctx.lineTo(f - 10, g - 14);
			ctx.lineTo(f - 60, g - 14);
			ctx.closePath();
			ctx.fill();
			ctx.strokeStyle = p.vehicle;
			ctx.lineWidth = 3;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(f - 12, g - 28);
			ctx.lineTo(f - 18, g - 46);
			ctx.stroke();
			rider(ctx, p, [f - 46, g - 36], [f - 36, g - 64], [f - 18, g - 46], [f - 30, g - 22]);
		},
	},
	"o-to": {
		length: 104,
		height: 52,
		wheelRadius: 12,
		wheels: [22, 82],
		draw(ctx, f, g, p) {
			ctx.fillStyle = p.vehicle;
			roundRect(ctx, f - 104, g - 34, 104, 22, 8);
			ctx.fill();
			ctx.beginPath();
			ctx.moveTo(f - 82, g - 33);
			ctx.lineTo(f - 66, g - 50);
			ctx.lineTo(f - 36, g - 50);
			ctx.lineTo(f - 22, g - 33);
			ctx.closePath();
			ctx.fill();
			ctx.fillStyle = p.surface;
			ctx.globalAlpha = 0.75;
			ctx.beginPath();
			ctx.moveTo(f - 76, g - 34);
			ctx.lineTo(f - 64, g - 46);
			ctx.lineTo(f - 53, g - 46);
			ctx.lineTo(f - 53, g - 34);
			ctx.closePath();
			ctx.moveTo(f - 49, g - 34);
			ctx.lineTo(f - 49, g - 46);
			ctx.lineTo(f - 38, g - 46);
			ctx.lineTo(f - 28, g - 34);
			ctx.closePath();
			ctx.fill();
			ctx.globalAlpha = 1;
		},
	},
};

type Point = readonly [number, number];

function rider(
	ctx: CanvasRenderingContext2D,
	p: Palette,
	hip: Point,
	head: Point,
	hand: Point,
	foot: Point,
) {
	const shoulder: Point = [head[0] - 2, head[1] + 10];
	ctx.strokeStyle = p.muted;
	ctx.lineWidth = 5;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.beginPath();
	ctx.moveTo(...hip);
	ctx.lineTo(...shoulder);
	ctx.lineTo(...hand);
	ctx.moveTo(...hip);
	ctx.lineTo((hip[0] + foot[0]) / 2 + 6, (hip[1] + foot[1]) / 2);
	ctx.lineTo(...foot);
	ctx.stroke();
	ctx.fillStyle = p.muted;
	ctx.beginPath();
	ctx.arc(head[0], head[1], 6, 0, Math.PI * 2);
	ctx.fill();
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function wheel(
	ctx: CanvasRenderingContext2D,
	p: Palette,
	cx: number,
	cy: number,
	r: number,
	angle: number,
	heat: number,
	thin: boolean,
) {
	if (heat > 0.01) {
		ctx.save();
		ctx.globalAlpha = Math.min(1, heat) * 0.55;
		ctx.fillStyle = p.brake;
		ctx.shadowColor = p.brake;
		ctx.shadowBlur = 18;
		ctx.beginPath();
		ctx.arc(cx, cy, r * (thin ? 1.05 : 0.7), 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}
	ctx.strokeStyle = p.rubber;
	ctx.lineWidth = thin ? 2.5 : 6;
	ctx.beginPath();
	ctx.arc(cx, cy, thin ? r : r - 3, 0, Math.PI * 2);
	ctx.stroke();
	// Brake surface: the rim on a bicycle, a disc in the hub otherwise. It warms toward the brake colour.
	const disc = thin ? r - 2 : r * 0.55;
	for (const [color, alpha] of [
		[p.metal, 1],
		[p.brake, Math.min(1, heat)],
	] as const) {
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc(cx, cy, disc, 0, Math.PI * 2);
		if (thin) {
			ctx.lineWidth = 2;
			ctx.stroke();
		} else ctx.fill();
	}
	ctx.globalAlpha = 1;
	ctx.strokeStyle = thin ? p.metal : p.rubber;
	ctx.lineWidth = thin ? 1 : 1.5;
	ctx.beginPath();
	for (let i = 0; i < (thin ? 6 : 3); i++) {
		const a = angle + (i * Math.PI * 2) / (thin ? 6 : 3);
		ctx.moveTo(cx, cy);
		ctx.lineTo(cx + Math.cos(a) * (disc - 1), cy + Math.sin(a) * (disc - 1));
	}
	ctx.stroke();
}

export interface SceneInput {
	vehicleId: string;
	setup: BrakeSetup;
	summary: BrakeSummary;
	state: BrakeState;
	palette: Palette;
}

export function drawScene(
	canvas: HTMLCanvasElement,
	{ vehicleId, setup, summary, state, palette: p }: SceneInput,
) {
	const { ctx, width, height } = fitCanvas(canvas);
	const shape = SHAPES[vehicleId] ?? (SHAPES["o-to"] as Shape);
	const ground = height - 64;
	const startX = shape.length + 14;
	const range = Math.max(summary.distance * 1.12, 2);
	const scale = (width - startX - 28) / range;
	const front = startX + state.x * scale;
	const stopX = startX + summary.distance * scale;
	const done = state.t >= summary.time - 1e-9;

	// Road with distance ticks.
	ctx.fillStyle = p.road;
	ctx.fillRect(0, ground, width, height - ground);
	ctx.strokeStyle = p.roadMark;
	ctx.lineWidth = 2;
	ctx.setLineDash([14, 12]);
	ctx.beginPath();
	ctx.moveTo(0, ground + 22);
	ctx.lineTo(width, ground + 22);
	ctx.stroke();
	ctx.setLineDash([]);
	const step = niceStep(range, Math.max(3, Math.floor((width - startX) / 70)));
	ctx.fillStyle = p.roadMark;
	ctx.font = "12px system-ui, sans-serif";
	ctx.textAlign = "center";
	for (let m = 0; m <= range + 1e-9; m += step) {
		const x = startX + m * scale;
		ctx.fillRect(x - 0.5, ground, 1, 7);
		ctx.fillText(`${num(m, step < 1 ? 1 : 0)} m`, x, ground + 46);
	}

	// Skid marks: locked tyres leave rubber behind from where the wheels stopped turning.
	if (setup.locked && state.x > 0) {
		ctx.fillStyle = p.skid;
		ctx.globalAlpha = 0.7;
		const [frontWheel, rearWheel] = shape.wheels;
		ctx.fillRect(startX - rearWheel, ground - 1, front - frontWheel - (startX - rearWheel), 4);
		ctx.globalAlpha = 1;
	}

	// Brake start and (predicted) stop lines.
	ctx.lineWidth = 1.5;
	ctx.setLineDash([4, 4]);
	ctx.strokeStyle = p.muted;
	ctx.beginPath();
	ctx.moveTo(startX, 24);
	ctx.lineTo(startX, ground + 8);
	ctx.stroke();
	ctx.strokeStyle = done ? p.ink : p.line;
	ctx.beginPath();
	ctx.moveTo(stopX, 24);
	ctx.lineTo(stopX, ground + 8);
	ctx.stroke();
	ctx.setLineDash([]);
	ctx.fillStyle = p.muted;
	ctx.textAlign = "left";
	ctx.fillText("bắt đầu phanh", Math.max(4, startX - 40), 16);
	ctx.textAlign = "right";
	ctx.fillStyle = done ? p.ink : p.muted;
	ctx.fillText(
		`dừng sau ${num(summary.distance, summary.distance < 10 ? 2 : 1)} m`,
		Math.min(width - 4, stopX + 40),
		16,
	);

	const peak = Math.max(summary.peakPower, 1);
	const share = (power: number) => Math.min(1, (power / peak) * 1.5);

	// Speed streaks behind the vehicle, shrinking as it slows.
	const speedRatio = setup.speed > 0 ? state.v / setup.speed : 0;
	if (speedRatio > 0.02) {
		ctx.strokeStyle = p.kinetic;
		ctx.lineCap = "round";
		ctx.lineWidth = 2;
		ctx.globalAlpha = 0.5;
		ctx.beginPath();
		for (const [dy, len] of [
			[-30, 26],
			[-20, 40],
			[-10, 22],
		] as const) {
			const tail = front - shape.length - 8;
			ctx.moveTo(tail, ground + dy);
			ctx.lineTo(tail - len * speedRatio, ground + dy);
		}
		ctx.stroke();
		ctx.globalAlpha = 1;
	}

	// Air warmed by drag: faint wisps off the tail, proportional to drag power.
	const airShare = share(state.powerAir) * 4;
	if (airShare > 0.02)
		wisps(ctx, p.air, front - shape.length - 4, ground - 40, Math.min(1, airShare), state.t, -1);

	// Smoke from sliding tyres.
	if (setup.locked && state.v > 0) {
		const smoke = share(state.powerTires);
		ctx.fillStyle = p.tires;
		for (let i = 0; i < 5; i++) {
			const age = (state.t * 3 + i / 5) % 1;
			ctx.globalAlpha = smoke * 0.35 * (1 - age);
			ctx.beginPath();
			ctx.arc(
				front - shape.wheels[1] - 6 - age * 30,
				ground - 6 - age * 18,
				4 + age * 10,
				0,
				Math.PI * 2,
			);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	shape.draw(ctx, front, ground, p);
	const rise = state.heatBrake / (setup.vehicle.brakeMass * setup.vehicle.brakeSpecificHeat);
	// Glow follows the real temperature rise, full at +30 °C: a bicycle rim barely warms in one stop.
	const heat = rise / 30;
	// Wheels roll with the road on screen, or freeze when locked.
	const travelled = (setup.locked ? 0 : state.x) * scale;
	for (const offset of shape.wheels) {
		wheel(
			ctx,
			p,
			front - offset,
			ground - shape.wheelRadius,
			shape.wheelRadius,
			travelled / shape.wheelRadius,
			heat,
			vehicleId === "xe-dap",
		);
	}

	// Heat rising off the brakes while they work.
	const brakeShare = share(state.powerBrake);
	if (brakeShare > 0.02)
		wisps(
			ctx,
			p.brake,
			front - shape.wheels[0],
			ground - shape.wheelRadius * 2 - 6,
			brakeShare,
			state.t,
			0,
		);

	ctx.fillStyle = p.ink;
	ctx.textAlign = "center";
	ctx.font = "600 13px system-ui, sans-serif";
	ctx.fillText(
		`${num(toKmh(state.v), toKmh(state.v) < 10 ? 1 : 0)} km/h`,
		front - shape.length / 2,
		ground - shape.height - 24,
	);
	if (state.heatBrake > 0) {
		ctx.font = "12px system-ui, sans-serif";
		ctx.fillStyle = p.brake;
		ctx.fillText(
			`phanh +${num(rise, rise < 10 ? 1 : 0)} °C`,
			front - shape.length / 2,
			ground - shape.height - 8,
		);
	}
}

function wisps(
	ctx: CanvasRenderingContext2D,
	color: string,
	x: number,
	y: number,
	strength: number,
	t: number,
	drift: number,
) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.5;
	ctx.lineCap = "round";
	for (let i = 0; i < 3; i++) {
		const phase = (t * 2.5 + i / 3) % 1;
		ctx.globalAlpha = strength * (1 - phase) * 0.9;
		ctx.beginPath();
		const baseX = x + (i - 1) * 7 + drift * phase * 16;
		const baseY = y - phase * 16;
		for (let k = 0; k <= 12; k++) {
			const yy = baseY - k;
			const xx = baseX + Math.sin(k / 2 + phase * 6 + i) * 2.5;
			if (k === 0) ctx.moveTo(xx, yy);
			else ctx.lineTo(xx, yy);
		}
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

/* ---------- Power over time ---------- */

export interface Sample {
	t: number;
	v: number;
	brake: number;
	tires: number;
	air: number;
}

export function sampleStop(setup: BrakeSetup, summary: BrakeSummary, count = 160): Sample[] {
	return Array.from({ length: count + 1 }, (_, i) => {
		const s = brakeStateAt(setup, (summary.time * i) / count);
		return { t: s.t, v: s.v, brake: s.powerBrake, tires: s.powerTires, air: s.powerAir };
	});
}

/** Stacked power P(t) of each force; the filled area up to now is the work done, i.e. the heat made. */
export function drawPowerChart(
	canvas: HTMLCanvasElement,
	samples: Sample[],
	summary: BrakeSummary,
	t: number,
	speed: number,
	p: Palette,
) {
	const { ctx, width, height } = fitCanvas(canvas);
	const left = 50;
	const right = 62;
	const top = 12;
	const bottom = 26;
	const plotW = width - left - right;
	const plotH = height - top - bottom;
	const maxP = Math.max(summary.peakPower, 1);
	const X = (time: number) => left + (summary.time > 0 ? time / summary.time : 0) * plotW;
	const Y = (power: number) => top + plotH * (1 - power / maxP);

	ctx.strokeStyle = p.line;
	ctx.lineWidth = 1;
	ctx.font = "11px system-ui, sans-serif";
	ctx.fillStyle = p.muted;
	ctx.textAlign = "right";
	const pStep = niceStep(maxP, 3);
	for (let v = 0; v <= maxP + 1e-9; v += pStep) {
		ctx.beginPath();
		ctx.moveTo(left, Y(v));
		ctx.lineTo(width - right, Y(v));
		ctx.stroke();
		ctx.fillText(
			v >= 1000 ? `${num(v / 1000, pStep < 1000 ? 1 : 0)} kW` : `${num(v)} W`,
			left - 6,
			Y(v) + 4,
		);
	}
	ctx.textAlign = "center";
	const tStep = niceStep(summary.time || 1, Math.max(2, Math.floor(plotW / 70)));
	for (let s = 0; s <= summary.time + 1e-9; s += tStep) {
		ctx.fillText(`${num(s, tStep < 1 ? 1 : 0)} s`, X(s), height - 8);
	}
	ctx.textAlign = "left";
	const vStep = niceStep(toKmh(speed), 3);
	for (let v = 0; v <= toKmh(speed) + 1e-9; v += vStep) {
		ctx.fillText(`${num(v)} km/h`, width - right + 6, top + plotH * (1 - v / toKmh(speed)) + 4);
	}

	const layers: [keyof Sample, string][] = [
		["brake", p.brake],
		["tires", p.tires],
		["air", p.air],
	];
	let below = samples.map(() => 0);
	for (const [key, color] of layers) {
		const above = samples.map((s, i) => (below[i] ?? 0) + s[key]);
		for (const filled of [false, true]) {
			ctx.save();
			if (filled) {
				ctx.beginPath();
				ctx.rect(left, 0, X(t) - left, height);
				ctx.clip();
			}
			ctx.globalAlpha = filled ? 0.85 : 0.18;
			ctx.fillStyle = color;
			ctx.beginPath();
			samples.forEach((s, i) => {
				const x = X(s.t);
				const y = Y(above[i] ?? 0);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			});
			for (let i = samples.length - 1; i >= 0; i--) {
				ctx.lineTo(X(samples[i]?.t ?? 0), Y(below[i] ?? 0));
			}
			ctx.closePath();
			ctx.fill();
			ctx.restore();
		}
		below = above;
	}

	// Speed on its own axis.
	ctx.strokeStyle = p.kinetic;
	ctx.lineWidth = 2;
	ctx.beginPath();
	samples.forEach((s, i) => {
		const x = X(s.t);
		const y = top + plotH * (1 - (speed > 0 ? s.v / speed : 0));
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	});
	ctx.stroke();

	ctx.strokeStyle = p.ink;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(X(t), top);
	ctx.lineTo(X(t), top + plotH);
	ctx.stroke();
}
