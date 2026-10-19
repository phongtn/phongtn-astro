import QRCode from "qrcode";
import { bankName } from "./banks";
import { formatVnd } from "./money";
import { type Balance, type Settlement, participantsOf } from "./split";
import type { BankAccount, Trip } from "./types";

const W = 1080;
const PAD = 64;
const CW = W - PAD * 2;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const C = {
	bg: "#f4f1ea",
	card: "#ffffff",
	ink: "#1c1a16",
	muted: "#6f6a60",
	line: "#e3ded2",
	accent: "#0f766e",
	warn: "#b45309",
};

export interface BillInput {
	trip: Trip;
	settlement: Settlement;
	balance: Balance;
	bank: BankAccount | null;
	qrPayload: string | null;
	memo: string;
}

interface TextOptions {
	weight?: number;
	color?: string;
	align?: CanvasTextAlign;
	max?: number;
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
	if (ctx.measureText(text).width <= max) return text;
	let s = text;
	while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
	return `${s.trimEnd()}…`;
}

/** Draws a QR code with whole-pixel modules (no anti-aliased seams) centred in a size×size square. */
export function drawQr(
	ctx: CanvasRenderingContext2D,
	payload: string,
	x: number,
	y: number,
	size: number,
) {
	const { modules } = QRCode.create(payload, { errorCorrectionLevel: "M" });
	const quiet = 4;
	const cell = Math.floor(size / (modules.size + quiet * 2));
	const offset = Math.floor((size - cell * modules.size) / 2);
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(x, y, size, size);
	ctx.fillStyle = "#000000";
	for (let row = 0; row < modules.size; row++) {
		for (let col = 0; col < modules.size; col++) {
			if (modules.get(row, col))
				ctx.fillRect(x + offset + col * cell, y + offset + row * cell, cell, cell);
		}
	}
}

/** Paints the bill and returns the height it needs; run once to measure, once to draw. */
function paint(ctx: CanvasRenderingContext2D, input: BillInput): number {
	const { trip, settlement, balance, bank, qrPayload, memo } = input;
	const right = W - PAD;
	const center = W / 2;
	const name = balance.member.name;
	const organizer = trip.members.find((m) => m.id === trip.organizerId)?.name ?? "";
	const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? organizer;
	const cards: { y: number; h: number }[] = [];
	let y = PAD;

	const text = (s: string, x: number, size: number, o: TextOptions = {}) => {
		ctx.font = `${o.weight ?? 400} ${size}px ${FONT}`;
		ctx.fillStyle = o.color ?? C.ink;
		ctx.textAlign = o.align ?? "left";
		ctx.textBaseline = "top";
		ctx.fillText(o.max ? fit(ctx, s, o.max) : s, x, y);
	};
	const divider = () => {
		ctx.fillStyle = C.line;
		ctx.fillRect(PAD, y, CW, 2);
		y += 24;
	};
	const heading = (s: string) => {
		text(s, PAD, 34, { weight: 700, max: CW });
		y += 60;
	};
	const row = (label: string, value: string, o: TextOptions = {}) => {
		text(label, PAD, 30, { ...o, color: o.weight ? C.ink : C.muted, max: CW - 300 });
		text(value, right, 30, { weight: 600, ...o, align: "right" });
		y += 48;
	};
	const item = (label: string, detail: string, value: string, color: string = C.ink) => {
		text(label, PAD, 30, { max: CW - 300 });
		text(value, right, 30, { weight: 600, color, align: "right" });
		y += 40;
		text(detail, PAD, 24, { color: C.muted, max: CW - 300 });
		y += 50;
	};

	// Header
	text("CHIA TIỀN CHUYẾN ĐI", PAD, 24, { weight: 700, color: C.accent });
	y += 44;
	text(trip.name, PAD, 56, { weight: 800, max: CW });
	y += 78;
	const date = new Date(trip.createdAt).toLocaleDateString("vi-VN");
	text(
		`${date} · ${trip.members.length} người · Tổng chi ${formatVnd(settlement.total)}`,
		PAD,
		28,
		{
			color: C.muted,
			max: CW,
		},
	);
	y += 72;

	// What this person owes, and how to pay
	const cardTop = y;
	y += 52;
	if (balance.due > 0) {
		text(`${name} cần chuyển cho ${organizer}`, center, 32, {
			color: C.muted,
			align: "center",
			max: CW - 96,
		});
		y += 54;
		text(formatVnd(balance.due), center, 96, { weight: 800, color: C.accent, align: "center" });
		y += 132;
		if (bank && qrPayload) {
			drawQr(ctx, qrPayload, center - 270, y, 540);
			y += 540 + 36;
			text(`${bankName(bank.bin)} · ${bank.account}`, center, 32, {
				weight: 700,
				align: "center",
				max: CW - 96,
			});
			y += 48;
			if (bank.holder) {
				text(bank.holder, center, 28, { color: C.muted, align: "center", max: CW - 96 });
				y += 44;
			}
			text(`Nội dung: ${memo}`, center, 26, { color: C.muted, align: "center", max: CW - 96 });
			y += 42;
			text("Quét bằng app ngân hàng, số tiền đã điền sẵn", center, 24, {
				color: C.muted,
				align: "center",
				max: CW - 96,
			});
			y += 36;
		}
	} else if (balance.due < 0) {
		text(`${organizer} sẽ chuyển lại cho ${name}`, center, 32, {
			color: C.muted,
			align: "center",
			max: CW - 96,
		});
		y += 54;
		text(formatVnd(balance.due), center, 96, { weight: 800, color: C.warn, align: "center" });
		y += 120;
	} else {
		text(`${name} không cần chuyển thêm`, center, 40, {
			weight: 700,
			align: "center",
			max: CW - 96,
		});
		y += 60;
	}
	y += 28;
	cards.push({ y: cardTop, h: y - cardTop });
	y += 56;

	// This person's part
	heading(`Phần của ${name}`);
	for (const line of balance.lines) {
		const detail =
			line.count > 1 ? `${formatVnd(line.expense.amount)} ÷ ${line.count} người` : `Riêng ${name}`;
		item(line.expense.name, detail, formatVnd(line.share));
	}
	for (const expense of balance.paidExpenses) {
		item(
			`${name} đã trả: ${expense.name}`,
			"Được trừ lại",
			`−${formatVnd(expense.amount)}`,
			C.accent,
		);
	}
	divider();
	row("Tổng phần phải chịu", formatVnd(balance.share));
	if (balance.paid) row("Đã trả trước", `−${formatVnd(balance.paid)}`);
	const settleLabel = balance.due >= 0 ? "Cần chuyển" : "Được nhận lại";
	row(settleLabel, formatVnd(balance.due), {
		weight: 800,
		color: balance.due >= 0 ? C.accent : C.warn,
	});
	if (balance.due !== balance.net) {
		text(`Đã làm tròn đến nghìn đồng (chính xác: ${formatVnd(balance.net)})`, PAD, 24, {
			color: C.muted,
			max: CW,
		});
		y += 40;
	}
	y += 48;

	// Every expense of the trip
	heading("Toàn bộ khoản chi");
	for (const expense of trip.expenses) {
		const count = participantsOf(trip, expense).length;
		const split = count === trip.members.length ? `chia đều ${count} người` : `chia ${count} người`;
		item(expense.name, `${nameOf(expense.payerId)} trả · ${split}`, formatVnd(expense.amount));
	}
	divider();
	row("Tổng chi", formatVnd(settlement.total), { weight: 800 });
	y += 48;

	// Everyone's share
	heading("Mỗi người");
	const shareX = right - 300;
	text("Phần chịu", shareX, 24, { color: C.muted, align: "right" });
	text("Cần chuyển", right, 24, { color: C.muted, align: "right" });
	y += 44;
	for (const b of settlement.balances) {
		const self = b.member.id === balance.member.id;
		const weight = self ? 800 : 400;
		const label = b.isOrganizer ? `${b.member.name} (tổ chức)` : b.member.name;
		const due = b.isOrganizer ? "—" : b.due < 0 ? `nhận ${formatVnd(b.due)}` : formatVnd(b.due);
		text(label, PAD, 30, { weight, max: shareX - PAD - 220 });
		text(formatVnd(b.share), shareX, 30, { weight, color: C.muted, align: "right" });
		text(due, right, 30, { weight, color: b.due < 0 ? C.warn : C.ink, align: "right" });
		y += 50;
	}
	y += 40;
	text("phongtn.com/chia", center, 24, { color: C.muted, align: "center" });
	y += 30 + PAD;

	// Cards and page background go underneath what is already painted.
	ctx.globalCompositeOperation = "destination-over";
	ctx.fillStyle = C.card;
	for (const card of cards) {
		ctx.beginPath();
		if (typeof ctx.roundRect === "function") ctx.roundRect(PAD, card.y, CW, card.h, 36);
		else ctx.rect(PAD, card.y, CW, card.h);
		ctx.fill();
	}
	ctx.fillStyle = C.bg;
	ctx.fillRect(0, 0, W, ctx.canvas.height);
	ctx.globalCompositeOperation = "source-over";
	return y;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Trình duyệt không hỗ trợ vẽ ảnh.");
	return ctx;
}

export function renderBill(input: BillInput): HTMLCanvasElement {
	const probe = document.createElement("canvas");
	probe.width = W;
	probe.height = 1;
	const canvas = document.createElement("canvas");
	canvas.width = W;
	canvas.height = paint(context(probe), input);
	paint(context(canvas), input);
	return canvas;
}

export function toPngFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(new File([blob], filename, { type: "image/png" }));
			else reject(new Error("Không tạo được ảnh."));
		}, "image/png");
	});
}
