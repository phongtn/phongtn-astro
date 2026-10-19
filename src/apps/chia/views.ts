// Views shared by the organizer's screens and the group's read-only link.

import { bankName } from "./banks";
import { drawQr, renderQrCard, toPngFile } from "./bill-image";
import { formatVnd } from "./money";
import type { Payment, SharedView } from "./share-server";
import { type Balance, type Settlement, participantsOf } from "./split";
import type { BankAccount, Expense, Member, Trip } from "./types";
import { type Child, copy, h, shareOrDownload, toast } from "./ui";
import { MEMO_MAX, buildVietQr, toMemo } from "./vietqr";

export const date = (t: number) => new Date(t).toLocaleDateString("vi-VN");
export const time = (t: number) =>
	new Date(t).toLocaleString("vi-VN", {
		hour: "2-digit",
		minute: "2-digit",
		day: "2-digit",
		month: "2-digit",
	});
/** "14:32 22/10" in the viewer's local time; empty when unknown. */
export function shortTime(iso: string): string {
	const d = new Date(iso);
	if (!iso || Number.isNaN(d.getTime())) return "";
	const p = (n: number) => String(n).padStart(2, "0");
	return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}
export const nameOf = (trip: Trip, id: string) =>
	(trip.members.find((m) => m.id === id) ?? trip.members.find((m) => m.id === trip.organizerId))
		?.name ?? "";
export const slug = (s: string) => toMemo(s, 30).toLowerCase().replace(/ /g, "-") || "chia";

export function splitLabel(trip: Trip, ids: string[]): string {
	if (ids.length === trip.members.length) return `chia đều ${ids.length} người`;
	if (ids.length <= 3) return `chia ${ids.map((id) => nameOf(trip, id)).join(", ")}`;
	return `chia ${ids.length} người`;
}

export const describe = (trip: Trip, e: Expense) =>
	`${nameOf(trip, e.payerId)} trả · ${splitLabel(trip, participantsOf(trip, e))}`;

export function expenseList(
	trip: Trip,
	onPick?: (e: Expense) => void,
	editingId?: string | null,
): HTMLOListElement {
	return h(
		"ol",
		{ class: "expenses" },
		trip.expenses.map((e) => {
			const content = [
				h(
					"span",
					{ class: "expense-main" },
					h("strong", null, e.name),
					h("span", { class: "muted small" }, describe(trip, e)),
				),
				h("strong", { class: "amount" }, formatVnd(e.amount)),
			];
			return h(
				"li",
				null,
				onPick
					? h(
							"button",
							{
								type: "button",
								class: `expense${editingId === e.id ? " editing" : ""}`,
								onclick: () => onPick(e),
							},
							content,
						)
					: h("div", { class: "expense" }, content),
			);
		}),
	);
}

/** Everything needed to show who owes what and how to pay. */
export interface PayContext {
	trip: Trip;
	settlement: Settlement;
	bank: BankAccount | null;
	/** Payment code per member id; empty until the group link exists. */
	codes: Record<string, string>;
	/** Transfers SePay has matched, per member id. */
	payments: Record<string, Payment>;
	autoConfirm: boolean;
}

export interface PayState {
	received: number;
	/** What is still owed to the organizer; 0 for refunds. */
	remaining: number;
	/** Ticked by the organizer (cash, refunds). */
	manual: boolean;
	done: boolean;
}

export function payState(ctx: PayContext, b: Balance): PayState {
	const manual = ctx.trip.settled.includes(b.member.id);
	const received = ctx.payments[b.member.id]?.amount ?? 0;
	const remaining = b.due > 0 && !manual ? Math.max(b.due - received, 0) : 0;
	return {
		received,
		remaining,
		manual,
		done: b.due === 0 || manual || (b.due > 0 && remaining === 0),
	};
}

/** Transfer note: the SePay payment code first when there is one, so banks never cut it off. */
export function memoFor(trip: Trip, member: Member, code?: string): string {
	const who = toMemo(member.name, 12);
	if (code) return `${code} ${who}`.trim();
	return `${toMemo(trip.name, MEMO_MAX - who.length - 1)} ${who}`.trim();
}

export const memoOf = (ctx: PayContext, b: Balance) =>
	memoFor(ctx.trip, b.member, ctx.codes[b.member.id]);

export function qrPayloadOf(ctx: PayContext, b: Balance): string | null {
	const { remaining } = payState(ctx, b);
	if (!ctx.bank || remaining <= 0) return null;
	return buildVietQr({
		bin: ctx.bank.bin,
		account: ctx.bank.account,
		amount: remaining,
		memo: memoOf(ctx, b),
	});
}

export function progressBox(ctx: PayContext): Child {
	const owing = ctx.settlement.balances.filter((b) => !b.isOrganizer && b.due !== 0);
	if (!owing.length) return null;
	let done = 0;
	let collected = 0;
	for (const b of owing) {
		const state = payState(ctx, b);
		if (state.done) done++;
		if (b.due > 0) collected += state.manual ? b.due : Math.min(state.received, b.due);
	}
	const total = ctx.settlement.toCollect;
	const percent = total ? Math.round((collected / total) * 100) : 100;
	return h(
		"div",
		{ class: "progress-box" },
		h(
			"p",
			{ class: "small" },
			`Đã xong ${done}/${owing.length} người · đã thu ${formatVnd(collected)}/${formatVnd(total)}`,
		),
		h("div", { class: "progress" }, h("span", { style: `width:${percent}%` })),
	);
}

/** " · 14:32 22/10" for the latest SePay transfer, or "". */
function receivedWhen(ctx: PayContext, b: Balance): string {
	const at = shortTime(ctx.payments[b.member.id]?.at ?? "");
	return at ? ` · ${at}` : "";
}

/** Payment status under the name; hand-ticked states are skipped where a checkbox already shows them. */
function statusPill(ctx: PayContext, b: Balance, showManual: boolean): Child {
	const state = payState(ctx, b);
	const when = receivedWhen(ctx, b);
	if (b.due > 0 && state.received >= b.due)
		return h("span", { class: "pill ok" }, `✓ Đã chuyển${when}`);
	if (b.due > 0 && state.manual)
		return showManual ? h("span", { class: "pill ok" }, "✓ Đã chuyển") : null;
	if (b.due > 0 && state.received > 0) {
		return h("span", { class: "pill" }, `Đã nhận ${formatVnd(state.received)}${when}`);
	}
	if (b.due < 0 && state.manual && showManual)
		return h("span", { class: "pill ok" }, "✓ Đã trả lại");
	return null;
}

export function personCard(
	ctx: PayContext,
	b: Balance,
	opts: { href: string; transferIsPrimary: boolean; extra?: Child; buttons?: Child },
): HTMLLIElement {
	const state = payState(ctx, b);
	const owes = b.due > 0 && !state.done;
	const due =
		b.due > 0 ? formatVnd(b.due) : b.due < 0 ? `Nhận lại ${formatVnd(b.due)}` : "Không cần chuyển";
	return h(
		"li",
		{ class: `card person${state.done && b.due !== 0 ? " done" : ""}` },
		h(
			"div",
			{ class: "person-main" },
			h("strong", null, b.member.name),
			h(
				"span",
				{ class: "muted small" },
				`Phần chịu ${formatVnd(b.share)}${b.paid ? ` · đã trả trước ${formatVnd(b.paid)}` : ""}`,
			),
			statusPill(ctx, b, !opts.extra),
		),
		h("strong", { class: `due${b.due < 0 ? " warn" : ""}` }, due),
		h(
			"div",
			{ class: "person-actions" },
			opts.extra ?? null,
			h(
				"div",
				{ class: "person-buttons" },
				h(
					"a",
					{
						class: `button small${owes && opts.transferIsPrimary ? " primary" : ""}`,
						href: opts.href,
					},
					owes ? "Chuyển khoản" : "Chi tiết",
				),
				opts.buttons ?? null,
			),
		),
	);
}

function infoRow(
	label: string,
	value: string,
	copyValue?: string,
	copied?: string,
): HTMLDivElement {
	return h(
		"div",
		{ class: "info-row" },
		h("span", { class: "muted small" }, label),
		h("strong", null, value),
		copyValue
			? h(
					"button",
					{ class: "small", type: "button", onclick: () => copy(copyValue, copied) },
					"Sao chép",
				)
			: null,
	);
}

function qrBlock(ctx: PayContext, b: Balance, payload: string, remaining: number): HTMLElement {
	const size = 480;
	const canvas = h("canvas", {
		class: "qr",
		width: size,
		height: size,
		role: "img",
		"aria-label": `Mã QR chuyển ${formatVnd(remaining)}`,
	});
	const c2d = canvas.getContext("2d");
	if (c2d) drawQr(c2d, payload, 0, 0, size);
	const organizer = nameOf(ctx.trip, ctx.trip.organizerId);
	let file: File | null = null;
	const save = h(
		"button",
		{
			class: "block",
			type: "button",
			disabled: true,
			onclick: () => {
				if (file) void shareOrDownload(file, ctx.trip.name);
			},
		},
		"Lưu mã QR",
	);
	if (ctx.bank) {
		const card = renderQrCard({
			title: ctx.trip.name,
			line: `${b.member.name} chuyển cho ${organizer}`,
			amount: remaining,
			payload,
			bank: ctx.bank,
			memo: memoOf(ctx, b),
		});
		toPngFile(card, `qr-${slug(ctx.trip.name)}-${slug(b.member.name)}.png`)
			.then((f) => {
				file = f;
				save.disabled = false;
			})
			.catch(() => toast("Không tạo được ảnh mã QR"));
	}
	return h(
		"div",
		{ class: "qr-block" },
		canvas,
		save,
		h(
			"p",
			{ class: "hint" },
			"Đang mở trên điện thoại này? Lưu mã QR rồi chọn ảnh đó trong app ngân hàng.",
		),
	);
}

/** One person's screen: what to pay and how, plus their own share. No list of every expense. */
export function personDetailView(
	ctx: PayContext,
	memberId: string,
	opts: { back: string; footer?: Child[] },
): Child[] {
	const b = ctx.settlement.balances.find((x) => x.member.id === memberId);
	const header = (title: string) =>
		h(
			"header",
			{ class: "bar" },
			h("a", { class: "icon", href: opts.back, "aria-label": "Quay lại" }, "‹"),
			h(
				"div",
				{ class: "bar-title" },
				h("strong", null, title),
				h("span", { class: "muted small" }, ctx.trip.name),
			),
		);
	if (!b)
		return [
			header("Không tìm thấy"),
			h("p", { class: "note" }, "Người này không còn trong chuyến đi."),
		];
	const name = b.member.name;
	const organizer = nameOf(ctx.trip, ctx.trip.organizerId);
	const state = payState(ctx, b);
	const payload = qrPayloadOf(ctx, b);
	const memo = memoOf(ctx, b);

	let hero: Child;
	if (b.due > 0 && state.done) {
		hero = h(
			"section",
			{ class: "card hero" },
			h("p", { class: "muted" }, `${name} đã chuyển cho ${organizer}`),
			h("p", { class: "hero-amount" }, formatVnd(b.due)),
			h("span", { class: "pill ok" }, `✓ Đã nhận đủ${receivedWhen(ctx, b)}, cảm ơn!`),
		);
	} else if (b.due > 0) {
		hero = h(
			"section",
			{ class: "card hero" },
			h("p", { class: "muted" }, `${name} cần chuyển cho ${organizer}`),
			h("p", { class: "hero-amount" }, formatVnd(state.remaining)),
			state.received
				? h(
						"span",
						{ class: "pill" },
						`Đã nhận ${formatVnd(state.received)}${receivedWhen(ctx, b)}, còn lại số trên`,
					)
				: null,
			payload
				? qrBlock(ctx, b, payload, state.remaining)
				: h("p", { class: "warn" }, `${organizer} chưa nhập tài khoản nhận tiền.`),
			ctx.autoConfirm
				? h(
						"p",
						{ class: "hint" },
						"Chuyển đúng nội dung bên dưới, bảng sẽ tự cập nhật khi tiền vào.",
					)
				: null,
		);
	} else if (b.due < 0) {
		hero = h(
			"section",
			{ class: "card hero" },
			h("p", { class: "muted" }, `${organizer} sẽ chuyển lại cho ${name}`),
			h("p", { class: "hero-amount warn" }, formatVnd(b.due)),
			state.manual ? h("span", { class: "pill ok" }, "✓ Đã trả lại") : null,
		);
	} else {
		hero = h(
			"section",
			{ class: "card hero" },
			h("p", { class: "hero-amount" }, "0đ"),
			h("p", { class: "muted" }, `${name} không cần chuyển thêm.`),
		);
	}

	const bank = ctx.bank;
	const info =
		payload && bank
			? h(
					"section",
					{ class: "card info" },
					infoRow("Ngân hàng", bankName(bank.bin)),
					infoRow("Số tài khoản", bank.account, bank.account, "Đã sao chép số tài khoản"),
					bank.holder ? infoRow("Chủ tài khoản", bank.holder) : null,
					infoRow(
						"Số tiền",
						formatVnd(state.remaining),
						String(state.remaining),
						"Đã sao chép số tiền",
					),
					infoRow("Nội dung", memo, memo, "Đã sao chép nội dung"),
				)
			: null;

	const lines = [
		...b.lines.map((line) =>
			h(
				"li",
				null,
				h(
					"div",
					{ class: "expense" },
					h(
						"span",
						{ class: "expense-main" },
						h("strong", null, line.expense.name),
						h(
							"span",
							{ class: "muted small" },
							line.count > 1
								? `${formatVnd(line.expense.amount)} ÷ ${line.count} người`
								: `Riêng ${name}`,
						),
					),
					h("strong", { class: "amount" }, formatVnd(line.share)),
				),
			),
		),
		...b.paidExpenses.map((e) =>
			h(
				"li",
				null,
				h(
					"div",
					{ class: "expense" },
					h(
						"span",
						{ class: "expense-main" },
						h("strong", null, `${name} đã trả: ${e.name}`),
						h("span", { class: "muted small" }, "Được trừ lại"),
					),
					h("strong", { class: "amount accent" }, `−${formatVnd(e.amount)}`),
				),
			),
		),
	];

	return [
		header(name),
		hero,
		info,
		h("h2", null, `Phần của ${name}`),
		h("ol", { class: "expenses" }, lines),
		h(
			"div",
			{ class: "total-row" },
			h("span", null, "Tổng phần phải chịu"),
			h("strong", null, formatVnd(b.share)),
		),
		b.paid
			? h(
					"div",
					{ class: "total-row" },
					h("span", null, "Đã trả trước"),
					h("strong", null, `−${formatVnd(b.paid)}`),
				)
			: null,
		h(
			"div",
			{ class: "total-row" },
			h("strong", null, b.due >= 0 ? "Cần chuyển" : "Được nhận lại"),
			h("strong", { class: b.due >= 0 ? "accent" : "warn" }, formatVnd(b.due)),
		),
		b.due !== b.net
			? h("p", { class: "note" }, `Đã làm tròn đến nghìn đồng (chính xác: ${formatVnd(b.net)}).`)
			: null,
		...(opts.footer ?? []),
	];
}

/** The read-only page everyone in the group opens from the link. */
export function sharedSummaryView(view: SharedView, ctx: PayContext): Child[] {
	const s = ctx.settlement;
	const organizer = s.balances.find((b) => b.isOrganizer);
	const organizerName = organizer?.member.name ?? "";
	return [
		h(
			"header",
			{ class: "bar" },
			h(
				"div",
				{ class: "bar-title" },
				h("strong", null, ctx.trip.name),
				h("span", { class: "muted small" }, "Bảng chỉ xem"),
			),
		),
		h(
			"section",
			{ class: "stats" },
			h(
				"div",
				{ class: "card stat" },
				h("span", { class: "muted small" }, "Tổng chi"),
				h("strong", null, formatVnd(s.total)),
			),
			h(
				"div",
				{ class: "card stat" },
				h("span", { class: "muted small" }, "Số người"),
				h("strong", null, String(ctx.trip.members.length)),
			),
		),
		progressBox(ctx),
		ctx.autoConfirm
			? h(
					"p",
					{ class: "note" },
					"Chuyển khoản đúng nội dung trong màn Chuyển khoản, trạng thái sẽ tự cập nhật.",
				)
			: null,
		h("h2", null, "Từng người"),
		h(
			"ul",
			{ class: "people" },
			s.balances
				.filter((b) => !b.isOrganizer)
				.map((b) =>
					personCard(ctx, b, { href: `#/xem/${view.id}/${b.member.id}`, transferIsPrimary: true }),
				),
		),
		organizer
			? h(
					"p",
					{ class: "note" },
					`${organizerName} là người tổ chức: phần chịu ${formatVnd(organizer.share)}, đã trả ${formatVnd(organizer.paid)}. Số tiền mỗi người đã làm tròn đến nghìn đồng.`,
				)
			: null,
		h("h2", null, "Các khoản chi"),
		expenseList(ctx.trip),
		h(
			"div",
			{ class: "total-row" },
			h("span", null, "Tổng chi"),
			h("strong", null, formatVnd(s.total)),
		),
		h(
			"p",
			{ class: "note" },
			`Do ${organizerName} tạo · cập nhật ${time(view.updatedAt)} · link hết hạn ngày ${date(view.expiresAt)}.`,
		),
		h("p", { class: "note" }, h("a", { href: "#/" }, "Tạo bảng chia tiền của bạn")),
	];
}
