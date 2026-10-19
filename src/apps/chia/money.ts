const UNITS: Record<string, number> = { k: 1_000, tr: 1_000_000 };
const vnd = new Intl.NumberFormat("vi-VN");

/**
 * Parses the way people type money in Vietnamese chats:
 * "350k", "1tr2", "1.5tr", "1,5 triệu", "350.000", "350000đ".
 * Returns a positive integer amount in VND, or null when the input is not understood.
 */
export function parseAmount(input: string): number | null {
	const s = input
		.normalize("NFC")
		.toLowerCase()
		.replace(/\s+/g, "")
		.replace(/(vnđ|vnd|đ)$/, "")
		.replace(/triệu|trieu|tr\.?$/g, "tr")
		.replace(/nghìn|nghin|ngàn|ngan/g, "k");
	let value: number;
	const unit = s.match(/^(\d+(?:[.,]\d+)?)(k|tr)(\d{0,3})$/);
	if (unit) {
		const [, num = "", suffix = "", tail = ""] = unit;
		if (tail && /[.,]/.test(num)) return null;
		value =
			Number.parseFloat(`${num.replace(",", ".")}${tail ? `.${tail}` : ""}`) * (UNITS[suffix] ?? 1);
	} else if (/^\d+$/.test(s) || /^\d{1,3}([.,]\d{3})+$/.test(s)) {
		value = Number(s.replace(/[.,]/g, ""));
	} else {
		return null;
	}
	value = Math.round(value);
	return value > 0 && value < 1e12 ? value : null;
}

export function formatVnd(amount: number): string {
	return `${vnd.format(Math.abs(amount))}đ`;
}

/** Rounds to the nearest 1,000đ, symmetrically for negative amounts. */
export function roundThousand(amount: number): number {
	return Math.sign(amount) * Math.round(Math.abs(amount) / 1000) * 1000;
}
