import { KCAL } from "./physics";

const formatters = new Map<number, Intl.NumberFormat>();

/** Vietnamese number format: 1.234,5 */
export function num(value: number, digits = 0): string {
	let f = formatters.get(digits);
	if (!f) {
		f = new Intl.NumberFormat("vi-VN", {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		});
		formatters.set(digits, f);
	}
	return f.format(Object.is(Math.round(value * 10 ** digits), -0) ? 0 : value);
}

/** About three significant figures. */
const digitsFor = (value: number) => (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2);

export function energy(joules: number): string {
	const a = Math.abs(joules);
	if (a >= 1e6) return `${num(joules / 1e6, digitsFor(joules / 1e6))} MJ`;
	if (a >= 1e4) return `${num(joules / 1e3, digitsFor(joules / 1e3))} kJ`;
	return `${num(joules)} J`;
}

export function power(watts: number): string {
	if (Math.abs(watts) >= 1e3) return `${num(watts / 1e3, digitsFor(watts / 1e3))} kW`;
	return `${num(watts)} W`;
}

export const kcal = (joules: number) => {
	const value = joules / KCAL;
	return `${num(value, value < 10 ? 1 : 0)} kcal`;
};

export const percent = (part: number, whole: number, digits = 1) =>
	`${num(whole > 0 ? (100 * part) / whole : 0, digits)}%`;

export function duration(seconds: number): string {
	if (!Number.isFinite(seconds)) return "mãi mãi";
	const minutes = Math.round(seconds / 60);
	if (minutes < 90) return `${num(minutes)} phút`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}
