import { DEG, MONTH_DAYS, MONTH_START, YEAR, hoursShort, nf } from "./model";

type Colors = Record<
	"ink" | "muted" | "line" | "sun" | "cool" | "day" | "night" | "surface" | "body" | "data",
	string
>;

function colors(): Colors {
	const s = getComputedStyle(document.documentElement);
	const g = (n: string) => s.getPropertyValue(n).trim();
	return {
		ink: g("--ink"),
		muted: g("--muted"),
		line: g("--line"),
		sun: g("--sun"),
		cool: g("--cool"),
		day: g("--day-fill"),
		night: g("--night-fill"),
		surface: g("--surface"),
		body: g("--font-body"),
		data: g("--font-data"),
	};
}

function prep(canvas: HTMLCanvasElement) {
	const r = canvas.getBoundingClientRect();
	const dpr = Math.min(2, window.devicePixelRatio || 1);
	const w = Math.max(1, Math.round(r.width));
	const h = Math.max(1, Math.round(r.height));
	if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
		canvas.width = w * dpr;
		canvas.height = h * dpr;
	}
	const ctx = canvas.getContext("2d");
	ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx?.clearRect(0, 0, w, h);
	return { ctx, w, h, C: colors() };
}

type Pt = [number, number];

function segment(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) {
	ctx.beginPath();
	ctx.moveTo(a[0], a[1]);
	ctx.lineTo(b[0], b[1]);
	ctx.stroke();
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
	segment(ctx, [x1, y1], [x2, y2]);
	const a = Math.atan2(y2 - y1, x2 - x1);
	ctx.beginPath();
	ctx.moveTo(x2, y2);
	ctx.lineTo(x2 - 5 * Math.cos(a - 0.45), y2 - 5 * Math.sin(a - 0.45));
	ctx.lineTo(x2 - 5 * Math.cos(a + 0.45), y2 - 5 * Math.sin(a + 0.45));
	ctx.closePath();
	ctx.fill();
}

/** Mặt cắt Trái Đất trong mặt phẳng chứa trục quay và tia nắng; nắng chiếu từ trái sang. */
export function drawSection(canvas: HTMLCanvasElement, dec: number, lat: number, tilt: number) {
	const { ctx, w, h, C } = prep(canvas);
	if (!ctx) return;
	const R = Math.min(h * 0.34, w * 0.27);
	const cx = w * 0.58;
	const cy = h * 0.5;

	ctx.strokeStyle = C.sun;
	ctx.fillStyle = C.sun;
	ctx.lineWidth = 1.3;
	ctx.globalAlpha = 0.7;
	for (let i = -3; i <= 3; i++) {
		const y = cy + i * R * 0.3;
		const xEnd = cx - Math.sqrt(Math.max(0, R * R - (y - cy) ** 2)) - 6;
		arrow(ctx, 10, y, Math.max(24, xEnd), y);
	}
	ctx.globalAlpha = 1;
	ctx.font = `500 11px ${C.body}`;
	ctx.textAlign = "left";
	ctx.fillText("Nắng", 10, cy - R * 1.05);

	ctx.fillStyle = C.day;
	ctx.beginPath();
	ctx.arc(cx, cy, R, Math.PI / 2, (3 * Math.PI) / 2);
	ctx.fill();
	ctx.fillStyle = C.night;
	ctx.beginPath();
	ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2);
	ctx.fill();
	ctx.strokeStyle = C.muted;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(cx, cy, R, 0, Math.PI * 2);
	ctx.stroke();

	// trục (ax, ay) và phương vuông góc (px, py); vĩ tuyến nhìn từ cạnh là một đoạn thẳng
	const ax = -Math.sin(dec);
	const ay = -Math.cos(dec);
	const px = Math.cos(dec);
	const py = -Math.sin(dec);
	const seg = (l: number): [Pt, Pt] => {
		const s = Math.sin(l * DEG) * R;
		const half = Math.cos(l * DEG) * R;
		const c: Pt = [cx + ax * s, cy + ay * s];
		return [
			[c[0] - px * half, c[1] - py * half],
			[c[0] + px * half, c[1] + py * half],
		];
	};
	if (tilt >= 0.3) {
		ctx.setLineDash([4, 4]);
		ctx.globalAlpha = 0.55;
		for (const l of [tilt, -tilt, 90 - tilt, tilt - 90]) segment(ctx, ...seg(l));
		ctx.globalAlpha = 1;
		ctx.setLineDash([]);
	}
	segment(ctx, ...seg(0));
	ctx.strokeStyle = C.ink;
	ctx.lineWidth = 1.6;
	segment(ctx, [cx - ax * R * 1.32, cy - ay * R * 1.32], [cx + ax * R * 1.32, cy + ay * R * 1.32]);
	ctx.fillStyle = C.ink;
	ctx.font = `600 11px ${C.body}`;
	ctx.textAlign = "center";
	ctx.fillText("Bắc", cx + ax * R * 1.47, cy + ay * R * 1.47 + 4);
	ctx.fillText("Nam", cx - ax * R * 1.47, cy - ay * R * 1.47 + 4);

	const [a, b] = seg(lat);
	ctx.lineWidth = 4;
	ctx.lineCap = "round";
	if ((a[0] - cx) * (b[0] - cx) < 0) {
		const t = (cx - a[0]) / (b[0] - a[0]);
		const split: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
		ctx.strokeStyle = C.sun;
		segment(ctx, a, split);
		ctx.strokeStyle = C.cool;
		segment(ctx, split, b);
	} else {
		ctx.strokeStyle = a[0] < cx ? C.sun : C.cool;
		segment(ctx, a, b);
	}
	ctx.lineCap = "butt";

	ctx.font = `500 11px ${C.body}`;
	ctx.fillStyle = C.muted;
	ctx.fillText("Ngày", cx - R * 0.55, cy + R + 18);
	ctx.fillText("Đêm", cx + R * 0.55, cy + R + 18);
}

/** Cùng một chùm nắng rộng `bw` chiếu xiên ở độ cao `alt` trải ra đoạn dài `bw / sin(alt)`. */
export function drawBeam(canvas: HTMLCanvasElement, alt: number) {
	const { ctx, w, h, C } = prep(canvas);
	if (!ctx) return;
	const gy = h - 30;
	const fx = w * 0.56;
	const bw = Math.min(70, w * 0.2);

	ctx.strokeStyle = C.muted;
	ctx.lineWidth = 1.5;
	segment(ctx, [8, gy], [w - 8, gy]);
	ctx.setLineDash([4, 4]);
	ctx.lineWidth = 1;
	ctx.strokeRect(fx - bw / 2, 14, bw, gy - 14);
	ctx.setLineDash([]);
	ctx.font = `500 10.5px ${C.body}`;
	ctx.fillStyle = C.muted;
	ctx.textAlign = "center";
	ctx.fillText("chiếu thẳng 90°", fx, gy + 26);
	if (alt <= 0.2) {
		ctx.fillStyle = C.cool;
		ctx.font = `600 13px ${C.body}`;
		ctx.fillText("Mặt Trời không mọc", fx, gy / 2);
		return;
	}

	const s = Math.sin(alt * DEG);
	const L = bw / s;
	const len = Math.hypot(w, h) * 1.2;
	const A: Pt = [fx - L / 2, gy];
	const B: Pt = [fx + L / 2, gy];
	const dx = -Math.cos(alt * DEG) * len;
	const dy = -s * len;
	ctx.save();
	ctx.beginPath();
	ctx.rect(0, 0, w, gy);
	ctx.clip();
	ctx.fillStyle = C.sun;
	ctx.globalAlpha = 0.22;
	ctx.beginPath();
	ctx.moveTo(A[0], A[1]);
	ctx.lineTo(B[0], B[1]);
	ctx.lineTo(B[0] + dx, B[1] + dy);
	ctx.lineTo(A[0] + dx, A[1] + dy);
	ctx.closePath();
	ctx.fill();
	ctx.globalAlpha = 0.9;
	ctx.strokeStyle = C.sun;
	ctx.lineWidth = 1.2;
	segment(ctx, A, [A[0] + dx, A[1] + dy]);
	segment(ctx, B, [B[0] + dx, B[1] + dy]);
	ctx.restore();

	ctx.strokeStyle = C.sun;
	ctx.lineWidth = 5;
	ctx.lineCap = "round";
	segment(ctx, [Math.max(8, A[0]), gy], [Math.min(w - 8, B[0]), gy]);
	ctx.lineCap = "butt";
	ctx.strokeStyle = C.ink;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(B[0], gy, 26, Math.PI, Math.PI + alt * DEG);
	ctx.stroke();
	ctx.fillStyle = C.ink;
	ctx.font = `500 11px ${C.data}`;
	ctx.textAlign = "right";
	ctx.fillText(`${nf(alt, 0)}°`, B[0] - 30, gy - 6);
}

export const CHART_PAD = { l: 30, r: 10, t: 12, b: 24 };

/** Độ dài ngày (giờ) cho từng ngày trong năm, kèm vạch ngày đang xem. */
export function drawChart(canvas: HTMLCanvasElement, hoursByDay: number[], day: number, current: number) {
	const { ctx, w, h, C } = prep(canvas);
	if (!ctx) return;
	const P = CHART_PAD;
	const X = (d: number) => P.l + (d / YEAR) * (w - P.l - P.r);
	const Y = (hr: number) => P.t + (1 - hr / 24) * (h - P.t - P.b);

	ctx.font = `400 10px ${C.data}`;
	ctx.fillStyle = C.muted;
	ctx.lineWidth = 1;
	ctx.textAlign = "right";
	for (const hr of [0, 6, 12, 18, 24]) {
		ctx.setLineDash(hr === 12 ? [4, 4] : []);
		ctx.strokeStyle = hr === 12 ? C.muted : C.line;
		segment(ctx, [P.l, Y(hr)], [w - P.r, Y(hr)]);
		ctx.fillText(String(hr), P.l - 6, Y(hr) + 3);
	}
	ctx.setLineDash([]);
	ctx.textAlign = "center";
	MONTH_START.forEach((s, i) => {
		if (i % 2 === 0 || w > 380) ctx.fillText(`T${i + 1}`, X(s + (MONTH_DAYS[i] ?? 30) / 2), h - 7);
	});

	ctx.beginPath();
	ctx.moveTo(X(0), Y(0));
	hoursByDay.forEach((v, d) => ctx.lineTo(X(d), Y(v)));
	ctx.lineTo(X(YEAR), Y(0));
	ctx.closePath();
	ctx.fillStyle = C.sun;
	ctx.globalAlpha = 0.12;
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.beginPath();
	hoursByDay.forEach((v, d) => (d ? ctx.lineTo(X(d), Y(v)) : ctx.moveTo(X(d), Y(v))));
	ctx.strokeStyle = C.sun;
	ctx.lineWidth = 2;
	ctx.stroke();

	ctx.strokeStyle = C.ink;
	ctx.lineWidth = 1;
	segment(ctx, [X(day), P.t], [X(day), h - P.b]);
	ctx.fillStyle = C.surface;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(X(day), Y(current), 4.5, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	ctx.font = `500 11px ${C.data}`;
	ctx.fillStyle = C.ink;
	const right = X(day) < w * 0.7;
	ctx.textAlign = right ? "left" : "right";
	ctx.fillText(
		hoursShort(current),
		X(day) + (right ? 8 : -8),
		Math.min(h - P.b - 4, Math.max(P.t + 10, Y(current) - 8)),
	);
}

/** Đổi vị trí con trỏ trên biểu đồ thành ngày trong năm. */
export function chartDayAt(canvas: HTMLCanvasElement, clientX: number) {
	const r = canvas.getBoundingClientRect();
	const d = ((clientX - r.left - CHART_PAD.l) / (r.width - CHART_PAD.l - CHART_PAD.r)) * YEAR;
	return Math.max(0, Math.min(364.9, d));
}
