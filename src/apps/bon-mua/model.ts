// Mô hình Mặt Trời – Trái Đất đơn giản: quỹ đạo elip gần đúng, độ dài ngày tính theo tâm Mặt Trời,
// bỏ qua khúc xạ khí quyển.

export const DEG = Math.PI / 180;
export const ECC = 0.0167;
export const AU_MKM = 149.6;
export const SOLAR_CONSTANT = 1361;
export const YEAR = 365;
export const DEFAULT_TILT = 23.44;

export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_START = MONTH_DAYS.map((_, i) => MONTH_DAYS.slice(0, i).reduce((a, d) => a + d, 0));

export type City = { id: string; name: string; lat: number };
export const CITIES: City[] = [
	{ id: "hanoi", name: "Hà Nội", lat: 21.03 },
	{ id: "hcm", name: "TP. Hồ Chí Minh", lat: 10.82 },
	{ id: "eq", name: "Xích đạo", lat: 0 },
	{ id: "sydney", name: "Sydney", lat: -33.87 },
	{ id: "oslo", name: "Oslo", lat: 59.91 },
	{ id: "tromso", name: "Tromsø", lat: 69.65 },
];

export type Milestone = { name: string; day: number };
export const MILESTONES: Milestone[] = [
	{ name: "Xuân phân", day: 78.6 },
	{ name: "Hạ chí", day: 171.4 },
	{ name: "Thu phân", day: 265.3 },
	{ name: "Đông chí", day: 354.8 },
];
export const PERIHELION: Milestone = { name: "Cận nhật", day: 2.5 };
export const APHELION: Milestone = { name: "Viễn nhật", day: 184.4 };

export type Sun = {
	/** kinh độ hoàng đạo của Mặt Trời (rad) */
	lam: number;
	/** khoảng cách Trái Đất – Mặt Trời (đơn vị thiên văn) */
	r: number;
	/** vĩ độ điểm Mặt Trời đứng bóng (rad) */
	dec: number;
};

/** `d`: ngày trong năm, 0 = 1/1. */
export function sunModel(d: number, tilt: number): Sun {
	const M = (2 * Math.PI * (d - PERIHELION.day)) / 365.2596;
	const raw = M + 2 * ECC * Math.sin(M) + 283 * DEG;
	const lam = ((raw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
	return { lam, r: 1 - ECC * Math.cos(M), dec: Math.asin(Math.sin(tilt * DEG) * Math.sin(lam)) };
}

export type DayInfo = { hours: number; noonAlt: number; insolation: number };

/** Độ dài ngày (giờ), độ cao Mặt Trời giữa trưa (độ) và năng lượng nắng trung bình ngày (W/m²). */
export function dayInfo(latDeg: number, sun: Sun): DayInfo {
	const phi = latDeg * DEG;
	const cosH = -Math.tan(phi) * Math.tan(sun.dec);
	const H = cosH <= -1 ? Math.PI : cosH >= 1 ? 0 : Math.acos(cosH);
	const q =
		(SOLAR_CONSTANT / Math.PI / (sun.r * sun.r)) *
		(H * Math.sin(phi) * Math.sin(sun.dec) + Math.cos(phi) * Math.cos(sun.dec) * Math.sin(H));
	return {
		hours: (24 * H) / Math.PI,
		noonAlt: 90 - Math.abs(latDeg - sun.dec / DEG),
		insolation: Math.max(0, q),
	};
}

export function seasonOf(lam: number, north: boolean): string {
	const names = ["Xuân", "Hạ", "Thu", "Đông"];
	const q = Math.floor(lam / (Math.PI / 2)) % 4;
	return names[north ? q : (q + 2) % 4] ?? "";
}

export function nearestEvent(d: number): string {
	for (const m of [...MILESTONES, PERIHELION, APHELION]) {
		const gap = Math.abs(d - m.day);
		if (gap <= 1.2 || gap >= YEAR - 1.2) return m.name;
	}
	return "";
}

export function todayIndex(now = new Date()): number {
	return Math.min(364, (MONTH_START[now.getMonth()] ?? 0) + now.getDate() - 1 + 0.5);
}

// ---------- định dạng ----------

export const nf = (v: number, digits = 1) =>
	v.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const latText = (v: number) =>
	Math.abs(v) < 0.15 ? "0°" : `${nf(Math.abs(v))}° ${v > 0 ? "Bắc" : "Nam"}`;

function splitHours(h: number): [number, number] {
	let H = Math.floor(h);
	let m = Math.round((h - H) * 60);
	if (m === 60) {
		H += 1;
		m = 0;
	}
	return [H, m];
}

export function hoursText(h: number): string {
	if (h >= 23.995) return "24 giờ";
	if (h <= 0.005) return "0 giờ";
	const [H, m] = splitHours(h);
	return `${H} giờ ${String(m).padStart(2, "0")} phút`;
}

export function hoursShort(h: number): string {
	const [H, m] = splitHours(h);
	return `${H}g${String(m).padStart(2, "0")}`;
}

function dateOf(d: number) {
	const i = Math.floor(((d % YEAR) + YEAR) % YEAR);
	let mo = 11;
	while ((MONTH_START[mo] ?? 0) > i) mo--;
	return { day: i - (MONTH_START[mo] ?? 0) + 1, month: mo + 1 };
}

export const dateText = (d: number) => {
	const t = dateOf(d);
	return `${t.day} tháng ${t.month}`;
};

export const dateShort = (d: number) => {
	const t = dateOf(d);
	return `${t.day}/${t.month}`;
};
