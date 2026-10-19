import { BANKS, bankName } from "./banks";
import { renderBill, toPngFile } from "./bill-image";
import { formatVnd, parseAmount } from "./money";
import { type Balance, computeSettlement, participantsOf } from "./split";
import { load, newId, save } from "./store";
import type { BankAccount, Expense, Member, Trip } from "./types";
import { MEMO_MAX, buildVietQr, toMemo } from "./vietqr";

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: Record<string, unknown> | null = null,
	...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	for (const [key, value] of Object.entries(props ?? {})) {
		if (value === undefined || value === null || value === false) continue;
		if (key.startsWith("on") && typeof value === "function") {
			el.addEventListener(key.slice(2), value as EventListener);
		} else if (key === "class") el.className = String(value);
		else if (key in el) Reflect.set(el, key, value);
		else el.setAttribute(key, value === true ? "" : String(value));
	}
	el.append(...present(children.flat()));
	return el;
}

function present(children: Child[]): (Node | string)[] {
	return children.filter((c): c is Node | string => Boolean(c));
}

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");
const app = root;
const store = load();

const clean = (s: string, max = 40) => s.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max);
const same = (a: string, b: string) =>
	clean(a).toLocaleLowerCase("vi") === clean(b).toLocaleLowerCase("vi");
const date = (t: number) => new Date(t).toLocaleDateString("vi-VN");
const nameOf = (trip: Trip, id: string) =>
	(trip.members.find((m) => m.id === id) ?? trip.members.find((m) => m.id === trip.organizerId))
		?.name ?? "";
const slug = (s: string) => toMemo(s, 30).toLowerCase().replace(/ /g, "-") || "chia";

let toastTimer = 0;
const toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite" });
function toast(message: string) {
	(document.querySelector("dialog[open]") ?? document.body).append(toastEl);
	toastEl.textContent = message;
	toastEl.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 2800);
}

function persist() {
	if (!save(store))
		toast("Không lưu được. Hãy tắt chế độ ẩn danh hoặc cho phép trình duyệt lưu dữ liệu.");
}

async function copy(text: string) {
	try {
		await navigator.clipboard.writeText(text);
		toast("Đã sao chép");
	} catch {
		toast("Không sao chép được trên trình duyệt này");
	}
}

function field(label: string, control: HTMLElement, hint?: string) {
	return h(
		"div",
		{ class: "field" },
		h("label", { for: control.id }, label),
		control,
		hint ? h("p", { class: "hint" }, hint) : null,
	);
}

function openDialog(title: string, body: Child[], onClose?: () => void) {
	const dialog = h(
		"dialog",
		{ class: "sheet" },
		h(
			"div",
			{ class: "sheet-head" },
			h("strong", null, title),
			h(
				"button",
				{ class: "icon", type: "button", "aria-label": "Đóng", onclick: () => dialog.close() },
				"×",
			),
		),
		h("div", { class: "sheet-body" }, body),
	);
	dialog.addEventListener("click", (e) => {
		if (e.target === dialog) dialog.close();
	});
	dialog.addEventListener("close", () => {
		dialog.remove();
		onClose?.();
	});
	document.body.append(dialog);
	dialog.showModal();
	return dialog;
}

// ---------- Routing ----------

type Route =
	| { view: "home" }
	| { view: "new" }
	| { view: "trip"; trip: Trip }
	| { view: "summary"; trip: Trip };

function route(): Route {
	const [, section, id, sub] = location.hash.split("/");
	if (section === "moi") return { view: "new" };
	const trip = store.trips.find((t) => t.id === id);
	if (section === "t" && trip)
		return sub === "tong-ket" ? { view: "summary", trip } : { view: "trip", trip };
	return { view: "home" };
}

function go(hash: string) {
	if (location.hash === hash) render();
	else location.hash = hash;
}

let lastHash: string | null = null;
function render() {
	const r = route();
	document.body.dataset.view = r.view;
	const view =
		r.view === "home"
			? homeView()
			: r.view === "new"
				? newTripView()
				: r.view === "trip"
					? tripView(r.trip)
					: summaryView(r.trip);
	app.replaceChildren(...present(view));
	if (location.hash !== lastHash) {
		lastHash = location.hash;
		requestAnimationFrame(() =>
			window.scrollTo(0, r.view === "trip" ? document.body.scrollHeight : 0),
		);
	}
}

// ---------- Home ----------

function bankLine(): Child {
	const bank = store.profile.bank;
	return h(
		"p",
		{ class: "note" },
		bank ? `Nhận tiền: ${bankName(bank.bin)} · ${bank.account}` : "Chưa có tài khoản nhận tiền.",
		" ",
		h(
			"button",
			{ class: "link", type: "button", onclick: () => bankDialog() },
			bank ? "Sửa" : "Thêm",
		),
	);
}

function homeView(): Child[] {
	if (!store.trips.length) return newTripView();
	const trips = [...store.trips].sort((a, b) => b.createdAt - a.createdAt);
	return [
		h(
			"header",
			{ class: "intro" },
			h("h1", null, "Chia tiền"),
			h("p", { class: "muted" }, "Ghi chi tiêu chuyến đi, chia đều, gửi QR cho từng người."),
		),
		h("a", { class: "button primary block", href: "#/moi" }, "+ Chuyến đi mới"),
		h(
			"ul",
			{ class: "trips" },
			trips.map((trip) => {
				const s = computeSettlement(trip);
				const owing = s.balances.filter((b) => !b.isOrganizer && b.due !== 0);
				const done = owing.filter((b) => trip.settled.includes(b.member.id)).length;
				return h(
					"li",
					null,
					h(
						"a",
						{ class: "card trip", href: `#/t/${trip.id}` },
						h("strong", null, trip.name),
						h(
							"span",
							{ class: "muted small" },
							`${date(trip.createdAt)} · ${trip.members.length} người · ${formatVnd(s.total)}`,
						),
						owing.length
							? h(
									"span",
									{ class: done === owing.length ? "pill ok" : "pill" },
									done === owing.length ? "Đã thu xong" : `Đã xong ${done}/${owing.length} người`,
								)
							: null,
					),
				);
			}),
		),
		bankLine(),
		h("p", { class: "note" }, "Dữ liệu chỉ lưu trên trình duyệt của máy này."),
	];
}

// ---------- New trip ----------

function friends(): string[] {
	const count = new Map<string, { name: string; n: number }>();
	for (const trip of store.trips) {
		for (const m of trip.members) {
			if (m.id === trip.organizerId) continue;
			const key = clean(m.name).toLocaleLowerCase("vi");
			const entry = count.get(key) ?? { name: m.name, n: 0 };
			entry.n++;
			count.set(key, entry);
		}
	}
	return [...count.values()].sort((a, b) => b.n - a.n).map((e) => e.name);
}

function newTripView(): Child[] {
	const members: string[] = [];
	const nameInput = h("input", {
		id: "trip-name",
		placeholder: "Đà Lạt 10/2026",
		autocomplete: "off",
		maxLength: 40,
	});
	const meInput = h("input", {
		id: "me",
		value: store.profile.name,
		placeholder: "Tên của bạn",
		autocomplete: "off",
		maxLength: 30,
	});
	const memberInput = h("input", {
		id: "member",
		placeholder: "Gõ tên rồi nhấn Enter",
		autocomplete: "off",
		enterKeyHint: "enter",
		maxLength: 30,
	});
	const chips = h("span", { class: "chips" });
	const suggestions = h("div", { class: "chips" });
	const error = h("p", { class: "error", role: "alert" });

	const draw = () => {
		chips.replaceChildren(
			...members.map((name, i) =>
				h(
					"span",
					{ class: "chip on" },
					name,
					h(
						"button",
						{
							type: "button",
							class: "chip-x",
							"aria-label": `Bỏ ${name}`,
							onclick: () => {
								members.splice(i, 1);
								draw();
							},
						},
						"×",
					),
				),
			),
		);
		const known = friends()
			.filter((n) => !members.some((m) => same(m, n)) && !same(n, meInput.value))
			.slice(0, 12);
		suggestions.replaceChildren(
			...(known.length ? [h("span", { class: "hint" }, "Đã đi cùng:")] : []),
			...known.map((name) =>
				h(
					"button",
					{
						type: "button",
						class: "chip",
						onclick: () => {
							members.push(name);
							draw();
						},
					},
					`+ ${name}`,
				),
			),
		);
	};

	const addNames = (raw: string) => {
		for (const name of raw.split(/[,;\n]/).map((s) => clean(s, 30))) {
			if (!name) continue;
			if (members.some((m) => same(m, name)) || same(name, meInput.value))
				toast(`${name} đã có trong nhóm`);
			else members.push(name);
		}
		memberInput.value = "";
		draw();
	};

	memberInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (memberInput.value.trim()) addNames(memberInput.value);
		} else if (e.key === "Backspace" && !memberInput.value && members.length) {
			members.pop();
			draw();
		}
	});
	// Commas typed or pasted split names; mobile keyboards don't always report the key itself.
	memberInput.addEventListener("input", () => {
		if (/[,;\n]/.test(memberInput.value)) addNames(memberInput.value);
	});

	const fail = (message: string, input: HTMLInputElement) => {
		error.textContent = message;
		input.focus();
	};

	const submit = (e: Event) => {
		e.preventDefault();
		if (memberInput.value.trim()) addNames(memberInput.value);
		const tripName = clean(nameInput.value);
		const me = clean(meInput.value, 30);
		if (!tripName) return fail("Nhập tên chuyến đi.", nameInput);
		if (!me) return fail("Nhập tên của bạn.", meInput);
		if (!members.length) return fail("Thêm ít nhất một người đi cùng.", memberInput);
		const organizer: Member = { id: newId(), name: me };
		const trip: Trip = {
			id: newId(),
			name: tripName,
			createdAt: Date.now(),
			organizerId: organizer.id,
			members: [
				organizer,
				...members.filter((n) => !same(n, me)).map((name) => ({ id: newId(), name })),
			],
			expenses: [],
			settled: [],
		};
		store.profile.name = me;
		store.trips.push(trip);
		persist();
		go(`#/t/${trip.id}`);
	};

	draw();
	requestAnimationFrame(() => nameInput.focus());
	return [
		store.trips.length
			? h(
					"header",
					{ class: "bar" },
					h("a", { class: "icon", href: "#/", "aria-label": "Quay lại" }, "‹"),
				)
			: h(
					"header",
					{ class: "intro" },
					h("h1", null, "Chia tiền"),
					h("p", { class: "muted" }, "Ghi chi tiêu chuyến đi, chia đều, gửi QR cho từng người."),
				),
		h("h2", null, "Chuyến đi mới"),
		h(
			"form",
			{ class: "stack", novalidate: true, onsubmit: submit },
			field("Tên chuyến đi", nameInput),
			field("Tên của bạn (người tổ chức)", meInput),
			h(
				"div",
				{ class: "field" },
				h("label", { for: "member" }, "Người đi cùng"),
				h("div", { class: "chip-input", onclick: () => memberInput.focus() }, chips, memberInput),
				h("p", { class: "hint" }, "Dán cả danh sách như “An, Bình, Chi” cũng được."),
				suggestions,
			),
			error,
			h("button", { class: "primary block", type: "submit" }, "Bắt đầu ghi chi tiêu"),
		),
	];
}

// ---------- Expenses ----------

interface Draft {
	editingId: string | null;
	name: string;
	amount: string;
	participantIds: string[];
	payerId: string;
	panel: "split" | "payer" | null;
}

const drafts = new Map<string, Draft>();
const freshDraft = (trip: Trip): Draft => ({
	editingId: null,
	name: "",
	amount: "",
	participantIds: trip.members.map((m) => m.id),
	payerId: trip.organizerId,
	panel: null,
});

function splitLabel(trip: Trip, ids: string[]): string {
	if (ids.length === trip.members.length) return `chia đều ${ids.length} người`;
	if (ids.length <= 3) return `chia ${ids.map((id) => nameOf(trip, id)).join(", ")}`;
	return `chia ${ids.length} người`;
}

const describe = (trip: Trip, e: Expense) =>
	`${nameOf(trip, e.payerId)} trả · ${splitLabel(trip, participantsOf(trip, e))}`;

function expenseList(
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

function tripView(trip: Trip): Child[] {
	let d = drafts.get(trip.id) ?? freshDraft(trip);
	drafts.set(trip.id, d);
	const listBox = h("div", { class: "grow" });
	const totalEl = h("span", { class: "muted small" });
	const composer = h("form", { class: "composer", novalidate: true });

	const reset = () => {
		d = freshDraft(trip);
		drafts.set(trip.id, d);
	};

	const drawList = () => {
		const total = trip.expenses.reduce((sum, e) => sum + e.amount, 0);
		totalEl.textContent = `${formatVnd(total)} · ${trip.expenses.length} khoản · ${trip.members.length} người`;
		listBox.replaceChildren(
			trip.expenses.length
				? expenseList(trip, edit, d.editingId)
				: h(
						"div",
						{ class: "empty" },
						h("strong", null, "Chưa có khoản chi nào"),
						h(
							"p",
							{ class: "muted" },
							"Nhập khoản đầu tiên ở ô bên dưới, ví dụ “Khách sạn” và “2tr”.",
						),
						h("p", { class: "muted" }, "Mặc định chia đều cho cả nhóm và bạn là người trả."),
					),
		);
	};

	const edit = (e: Expense) => {
		d = {
			editingId: e.id,
			name: e.name,
			amount: formatVnd(e.amount),
			participantIds: participantsOf(trip, e),
			payerId: e.payerId,
			panel: null,
		};
		drafts.set(trip.id, d);
		drawList();
		drawComposer("amount");
	};

	const remove = () => {
		const expense = trip.expenses.find((e) => e.id === d.editingId);
		if (!expense || !confirm(`Xoá khoản “${expense.name}”?`)) return;
		trip.expenses = trip.expenses.filter((e) => e.id !== expense.id);
		persist();
		reset();
		drawList();
		drawComposer();
	};

	const commit = () => {
		const name = clean(d.name);
		const amount = parseAmount(d.amount);
		const input = (n: string) => composer.querySelector<HTMLInputElement>(`[name=${n}]`);
		if (!name) {
			toast("Nhập tên khoản chi");
			input("name")?.focus();
			return;
		}
		if (amount === null) {
			toast("Số tiền chưa đúng, ví dụ: 350k, 1tr2, 350000");
			input("amount")?.focus();
			return;
		}
		if (!d.participantIds.length) {
			toast("Chọn ít nhất một người để chia");
			d.panel = "split";
			drawComposer();
			return;
		}
		const expense: Expense = {
			id: d.editingId ?? newId(),
			name,
			amount,
			payerId: d.payerId,
			participantIds: [...d.participantIds],
		};
		const wasEditing = d.editingId !== null;
		if (wasEditing) trip.expenses = trip.expenses.map((e) => (e.id === expense.id ? expense : e));
		else trip.expenses.push(expense);
		persist();
		reset();
		drawList();
		drawComposer(wasEditing ? undefined : "name");
		if (!wasEditing) requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
	};

	const drawComposer = (focus?: "name" | "amount") => {
		const all = d.participantIds.length === trip.members.length;
		const nameIn = h("input", {
			name: "name",
			value: d.name,
			placeholder: "Khoản chi, vd: Ăn tối",
			autocomplete: "off",
			enterKeyHint: "next",
			maxLength: 40,
			"aria-label": "Tên khoản chi",
			oninput: () => {
				d.name = nameIn.value;
			},
			onkeydown: (e: KeyboardEvent) => {
				if (e.key === "Enter") {
					e.preventDefault();
					amountIn.focus();
				}
			},
		});
		const preview = h("p", { class: "preview", "aria-live": "polite" });
		const updatePreview = () => {
			const amount = parseAmount(d.amount);
			const n = d.participantIds.length;
			preview.classList.toggle("warn", Boolean(d.amount.trim()) && amount === null);
			if (!d.amount.trim()) preview.textContent = "Gõ nhanh: 350k · 1tr2 · 1.5tr";
			else if (amount === null) preview.textContent = "Chưa hiểu số tiền, thử 350k hoặc 1tr2";
			else
				preview.textContent = n
					? `= ${formatVnd(amount)} · khoảng ${formatVnd(Math.round(amount / n))}/người`
					: `= ${formatVnd(amount)}`;
		};
		const amountIn = h("input", {
			name: "amount",
			value: d.amount,
			placeholder: "Số tiền",
			autocomplete: "off",
			enterKeyHint: "done",
			"aria-label": "Số tiền",
			oninput: () => {
				d.amount = amountIn.value;
				updatePreview();
			},
		});

		const toggle = (panel: Draft["panel"]) => () => {
			d.panel = d.panel === panel ? null : panel;
			drawComposer();
		};
		let panel: Child = null;
		if (d.panel === "split") {
			panel = h(
				"div",
				{ class: "panel" },
				h("p", { class: "hint" }, "Chia cho ai?"),
				h(
					"div",
					{ class: "chips" },
					h(
						"button",
						{
							type: "button",
							class: `chip${all ? " on" : ""}`,
							"aria-pressed": String(all),
							onclick: () => {
								d.participantIds = all ? [] : trip.members.map((m) => m.id);
								drawComposer();
							},
						},
						"Tất cả",
					),
					trip.members.map((m) => {
						const on = d.participantIds.includes(m.id);
						return h(
							"button",
							{
								type: "button",
								class: `chip${on ? " on" : ""}`,
								"aria-pressed": String(on),
								onclick: () => {
									d.participantIds = trip.members
										.filter((x) => (x.id === m.id ? !on : d.participantIds.includes(x.id)))
										.map((x) => x.id);
									drawComposer();
								},
							},
							m.name,
						);
					}),
				),
			);
		} else if (d.panel === "payer") {
			panel = h(
				"div",
				{ class: "panel" },
				h("p", { class: "hint" }, "Ai đã trả khoản này?"),
				h(
					"div",
					{ class: "chips" },
					trip.members.map((m) =>
						h(
							"button",
							{
								type: "button",
								class: `chip${m.id === d.payerId ? " on" : ""}`,
								"aria-pressed": String(m.id === d.payerId),
								onclick: () => {
									d.payerId = m.id;
									d.panel = null;
									drawComposer();
								},
							},
							m.name,
						),
					),
				),
			);
		}

		composer.replaceChildren(
			...present([
				d.editingId
					? h(
							"div",
							{ class: "composer-head" },
							h("strong", null, "Sửa khoản chi"),
							h("button", { type: "button", class: "link danger", onclick: remove }, "Xoá"),
							h(
								"button",
								{
									type: "button",
									class: "link",
									onclick: () => {
										reset();
										drawList();
										drawComposer();
									},
								},
								"Huỷ",
							),
						)
					: null,
				panel,
				h("div", { class: "composer-row" }, nameIn, amountIn),
				preview,
				h(
					"div",
					{ class: "composer-row" },
					h(
						"button",
						{
							type: "button",
							class: `chip${d.panel === "split" ? " on" : ""}`,
							onclick: toggle("split"),
						},
						`${all ? `Chia đều ${trip.members.length}` : splitLabel(trip, d.participantIds).replace("chia ", "Chia: ")} ▾`,
					),
					h(
						"button",
						{
							type: "button",
							class: `chip${d.panel === "payer" ? " on" : ""}`,
							onclick: toggle("payer"),
						},
						`${nameOf(trip, d.payerId)} trả ▾`,
					),
					h("button", { type: "submit", class: "primary push" }, d.editingId ? "Lưu" : "Thêm"),
				),
			]),
		);
		updatePreview();
		if (focus === "name") nameIn.focus();
		else if (focus === "amount") amountIn.focus();
	};

	composer.addEventListener("submit", (e) => {
		e.preventDefault();
		commit();
	});

	const finish = () => {
		if (!trip.expenses.length) return toast("Chưa có khoản chi nào");
		if (!d.editingId && (d.name.trim() || d.amount.trim())) {
			if (!confirm("Khoản đang nhập chưa được thêm. Vẫn tổng kết?")) return;
		}
		go(`#/t/${trip.id}/tong-ket`);
	};

	drawList();
	drawComposer();
	return [
		h(
			"header",
			{ class: "bar" },
			h("a", { class: "icon", href: "#/", "aria-label": "Danh sách chuyến đi" }, "‹"),
			h("div", { class: "bar-title" }, h("strong", null, trip.name), totalEl),
			h(
				"button",
				{ class: "icon", type: "button", "aria-label": "Tuỳ chọn", onclick: () => tripMenu(trip) },
				"⋯",
			),
			h("button", { class: "primary small", type: "button", onclick: finish }, "Xong"),
		),
		listBox,
		composer,
	];
}

function tripMenu(trip: Trip) {
	const dialog = openDialog("Tuỳ chọn", [
		h(
			"button",
			{
				class: "block",
				type: "button",
				onclick: () => {
					dialog.close();
					membersDialog(trip);
				},
			},
			"Thành viên",
		),
		h(
			"button",
			{
				class: "block",
				type: "button",
				onclick: () => {
					const name = clean(prompt("Tên chuyến đi", trip.name) ?? "");
					if (!name) return;
					trip.name = name;
					persist();
					dialog.close();
					render();
				},
			},
			"Đổi tên chuyến đi",
		),
		h(
			"button",
			{
				class: "block danger",
				type: "button",
				onclick: () => {
					if (!confirm(`Xoá chuyến “${trip.name}” và toàn bộ khoản chi?`)) return;
					store.trips = store.trips.filter((t) => t.id !== trip.id);
					persist();
					dialog.close();
					go("#/");
				},
			},
			"Xoá chuyến đi",
		),
	]);
}

function removeMember(trip: Trip, member: Member): boolean {
	const paid = trip.expenses.find((e) => e.payerId === member.id);
	if (paid) {
		toast(`${member.name} đã trả “${paid.name}”. Đổi người trả trước khi xoá.`);
		return false;
	}
	const only = trip.expenses.find(
		(e) => e.participantIds.length === 1 && e.participantIds[0] === member.id,
	);
	if (only) {
		toast(`“${only.name}” chỉ chia cho ${member.name}. Sửa khoản đó trước.`);
		return false;
	}
	if (!confirm(`Xoá ${member.name} khỏi chuyến đi?`)) return false;
	trip.members = trip.members.filter((m) => m.id !== member.id);
	for (const e of trip.expenses)
		e.participantIds = e.participantIds.filter((id) => id !== member.id);
	trip.settled = trip.settled.filter((id) => id !== member.id);
	persist();
	return true;
}

function membersDialog(trip: Trip) {
	const list = h("ul", { class: "members" });
	const draw = () =>
		list.replaceChildren(
			...trip.members.map((m) => {
				const input = h("input", {
					value: m.name,
					maxLength: 30,
					"aria-label": `Tên của ${m.name}`,
					onchange: () => {
						const name = clean(input.value, 30);
						if (!name || trip.members.some((x) => x !== m && same(x.name, name))) {
							input.value = m.name;
							toast("Tên trống hoặc bị trùng");
							return;
						}
						m.name = name;
						if (m.id === trip.organizerId) store.profile.name = name;
						persist();
					},
				});
				return h(
					"li",
					null,
					input,
					m.id === trip.organizerId
						? h("span", { class: "hint" }, "Tổ chức")
						: h(
								"button",
								{
									type: "button",
									class: "icon danger",
									"aria-label": `Xoá ${m.name}`,
									onclick: () => {
										if (removeMember(trip, m)) draw();
									},
								},
								"×",
							),
				);
			}),
		);
	const addInput = h("input", {
		placeholder: "Tên người mới",
		maxLength: 30,
		autocomplete: "off",
		"aria-label": "Tên người mới",
	});
	const add = (e: Event) => {
		e.preventDefault();
		const name = clean(addInput.value, 30);
		if (!name) return;
		if (trip.members.some((m) => same(m.name, name))) return toast(`${name} đã có trong nhóm`);
		const member: Member = { id: newId(), name };
		trip.members.push(member);
		if (
			trip.expenses.length &&
			confirm(`Chia cả ${trip.expenses.length} khoản chi đã nhập cho ${name}?`)
		) {
			for (const expense of trip.expenses) expense.participantIds.push(member.id);
		}
		persist();
		addInput.value = "";
		draw();
	};
	draw();
	openDialog(
		"Thành viên",
		[
			list,
			h(
				"form",
				{ class: "composer-row", onsubmit: add },
				addInput,
				h("button", { class: "primary", type: "submit" }, "Thêm"),
			),
		],
		() => {
			drafts.delete(trip.id);
			render();
		},
	);
}

// ---------- Summary ----------

function bankForm(onSaved: () => void): HTMLFormElement {
	const current = store.profile.bank;
	const select = h(
		"select",
		{ id: "bank" },
		h("option", { value: "" }, "Chọn ngân hàng"),
		BANKS.map((b) => h("option", { value: b.bin }, b.name)),
	);
	select.value = current?.bin ?? "";
	const account = h("input", {
		id: "account",
		value: current?.account ?? "",
		inputMode: "numeric",
		autocomplete: "off",
		placeholder: "Số tài khoản",
		maxLength: 24,
	});
	const holder = h("input", {
		id: "holder",
		value: current?.holder ?? "",
		autocomplete: "off",
		autocapitalize: "characters",
		placeholder: "NGUYEN VAN A",
		maxLength: 50,
	});
	const error = h("p", { class: "error", role: "alert" });
	const submit = (e: Event) => {
		e.preventDefault();
		const acc = account.value.replace(/[\s.-]/g, "").toUpperCase();
		if (!select.value) {
			error.textContent = "Chọn ngân hàng.";
			return;
		}
		if (!/^[A-Z0-9]{4,19}$/.test(acc)) {
			error.textContent = "Số tài khoản không đúng.";
			return;
		}
		const bank: BankAccount = { bin: select.value, account: acc, holder: toMemo(holder.value, 50) };
		store.profile.bank = bank;
		persist();
		onSaved();
	};
	return h(
		"form",
		{ class: "stack", novalidate: true, onsubmit: submit },
		field("Ngân hàng", select),
		field("Số tài khoản", account),
		field("Tên chủ tài khoản", holder, "Không bắt buộc, giúp mọi người kiểm tra đúng người nhận."),
		error,
		h("button", { class: "primary block", type: "submit" }, "Lưu tài khoản"),
		h("p", { class: "hint" }, "Chỉ lưu trên trình duyệt này, dùng để tạo mã QR chuyển khoản."),
	);
}

function bankDialog(after?: () => void) {
	const dialog = openDialog("Tài khoản nhận tiền", [
		bankForm(() => {
			dialog.close();
			render();
			after?.();
		}),
	]);
}

function memoFor(trip: Trip, member: Member): string {
	const who = toMemo(member.name, 12);
	return `${toMemo(trip.name, MEMO_MAX - who.length - 1)} ${who}`.trim();
}

function messageFor(trip: Trip, b: Balance, bank: BankAccount | null, memo: string): string {
	const hi = `Chào ${b.member.name}! Tổng kết chuyến “${trip.name}”:`;
	if (b.due < 0) {
		return `${hi} bạn đã trả trước nhiều hơn phần của mình, ${nameOf(trip, trip.organizerId)} sẽ chuyển lại cho bạn ${formatVnd(b.due)}.`;
	}
	if (b.due === 0) return `${hi} bạn không cần chuyển thêm. Cảm ơn nhé!`;
	const to = bank
		? `\nChuyển khoản: ${bankName(bank.bin)} ${bank.account}${bank.holder ? ` (${bank.holder})` : ""}, nội dung “${memo}”.`
		: "";
	return `${hi} phần của bạn là ${formatVnd(b.due)}.${to}\nQuét mã QR trong ảnh là có sẵn số tiền. Cảm ơn nhé!`;
}

function groupMessage(trip: Trip): string {
	const s = computeSettlement(trip);
	const bank = store.profile.bank;
	const lines = s.balances
		.filter((b) => !b.isOrganizer)
		.map(
			(b) => `- ${b.member.name}: ${b.due < 0 ? `nhận lại ${formatVnd(b.due)}` : formatVnd(b.due)}`,
		);
	return [
		`Tổng kết chuyến “${trip.name}”: tổng chi ${formatVnd(s.total)} (${trip.members.length} người).`,
		...lines,
		bank
			? `Chuyển khoản: ${bankName(bank.bin)} ${bank.account}${bank.holder ? ` (${bank.holder})` : ""}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}

function sendDialog(trip: Trip, memberId: string) {
	const s = computeSettlement(trip);
	const b = s.balances.find((x) => x.member.id === memberId);
	if (!b) return;
	const bank = store.profile.bank;
	if (b.due > 0 && !bank) return bankDialog(() => sendDialog(trip, memberId));
	const memo = memoFor(trip, b.member);
	const qrPayload =
		b.due > 0 && bank
			? buildVietQr({ bin: bank.bin, account: bank.account, amount: b.due, memo })
			: null;
	const canvas = renderBill({ trip, settlement: s, balance: b, bank, qrPayload, memo });
	const filename = `chia-${slug(trip.name)}-${slug(b.member.name)}.png`;
	const message = messageFor(trip, b, bank, memo);

	let file: File | null = null;
	const shareBtn = h(
		"button",
		{ class: "primary block", type: "button", disabled: true },
		"Gửi ảnh qua Zalo, Messenger…",
	);
	const downloadBtn = h("button", { class: "block", type: "button", disabled: true }, "Tải ảnh về");
	shareBtn.addEventListener("click", async () => {
		if (!file) return;
		try {
			await navigator.share({ files: [file], title: trip.name });
		} catch (err) {
			if (!(err instanceof DOMException && err.name === "AbortError"))
				toast("Không gửi được, hãy tải ảnh về.");
		}
	});
	downloadBtn.addEventListener("click", () => {
		if (!file) return;
		const url = URL.createObjectURL(file);
		const a = h("a", { href: url, download: filename });
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	});
	toPngFile(canvas, filename)
		.then((f) => {
			file = f;
			downloadBtn.disabled = false;
			if (typeof navigator.canShare === "function" && navigator.canShare({ files: [f] }))
				shareBtn.disabled = false;
			else shareBtn.remove();
		})
		.catch(() => toast("Không tạo được ảnh"));

	openDialog(`Gửi ${b.member.name}`, [
		h("img", {
			class: "bill",
			src: canvas.toDataURL("image/png"),
			alt: `Bảng chia tiền gửi ${b.member.name}`,
		}),
		shareBtn,
		downloadBtn,
		h(
			"button",
			{ class: "block", type: "button", onclick: () => copy(message) },
			"Sao chép tin nhắn kèm theo",
		),
		h("p", { class: "hint" }, "Trên điện thoại cũng có thể nhấn giữ ảnh để lưu."),
	]);
}

function summaryView(trip: Trip): Child[] {
	const s = computeSettlement(trip);
	const bank = store.profile.bank;
	const others = s.balances.filter((b) => !b.isOrganizer);
	const me = s.balances.find((b) => b.isOrganizer);
	const owing = others.filter((b) => b.due !== 0);
	const done = owing.filter((b) => trip.settled.includes(b.member.id));
	const collected = done.reduce((sum, b) => sum + Math.max(b.due, 0), 0);
	const percent = s.toCollect ? Math.round((collected / s.toCollect) * 100) : 100;

	const setSettled = (id: string, value: boolean) => {
		trip.settled = value
			? [...new Set([...trip.settled, id])]
			: trip.settled.filter((x) => x !== id);
		persist();
		render();
	};

	const person = (b: Balance) => {
		const settled = trip.settled.includes(b.member.id);
		const due =
			b.due > 0
				? formatVnd(b.due)
				: b.due < 0
					? `Nhận lại ${formatVnd(b.due)}`
					: "Không cần chuyển";
		return h(
			"li",
			{ class: `card person${settled ? " done" : ""}` },
			h(
				"div",
				{ class: "person-main" },
				h("strong", null, b.member.name),
				h(
					"span",
					{ class: "muted small" },
					`Phần chịu ${formatVnd(b.share)}${b.paid ? ` · đã trả trước ${formatVnd(b.paid)}` : ""}`,
				),
			),
			h("strong", { class: `due${b.due < 0 ? " warn" : ""}` }, due),
			h(
				"div",
				{ class: "person-actions" },
				b.due !== 0
					? h(
							"label",
							{ class: "check" },
							h("input", {
								type: "checkbox",
								checked: settled,
								onchange: (e: Event) =>
									setSettled(b.member.id, (e.target as HTMLInputElement).checked),
							}),
							b.due > 0 ? "Đã chuyển" : "Đã trả lại",
						)
					: h("span"),
				h(
					"button",
					{ class: "primary small", type: "button", onclick: () => sendDialog(trip, b.member.id) },
					"Gửi",
				),
			),
		);
	};

	return [
		h(
			"header",
			{ class: "bar" },
			h("a", { class: "icon", href: `#/t/${trip.id}`, "aria-label": "Sửa khoản chi" }, "‹"),
			h(
				"div",
				{ class: "bar-title" },
				h("strong", null, "Tổng kết"),
				h("span", { class: "muted small" }, trip.name),
			),
			h("a", { class: "button small", href: `#/t/${trip.id}` }, "Sửa khoản chi"),
		),
		bank
			? null
			: h(
					"section",
					{ class: "card setup" },
					h("h2", null, "Tài khoản nhận tiền"),
					h(
						"p",
						{ class: "muted" },
						"Nhập một lần để app tạo mã QR có sẵn số tiền cho từng người.",
					),
					bankForm(() => render()),
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
				h("span", { class: "muted small" }, "Cần thu"),
				h("strong", null, formatVnd(s.toCollect)),
			),
			s.toRefund
				? h(
						"div",
						{ class: "card stat" },
						h("span", { class: "muted small" }, "Cần trả lại"),
						h("strong", { class: "warn" }, formatVnd(s.toRefund)),
					)
				: null,
		),
		owing.length
			? h(
					"div",
					{ class: "progress-box" },
					h(
						"p",
						{ class: "small" },
						`Đã xong ${done.length}/${owing.length} người · đã thu ${formatVnd(collected)}/${formatVnd(s.toCollect)}`,
					),
					h("div", { class: "progress" }, h("span", { style: `width:${percent}%` })),
				)
			: null,
		h("h2", null, "Từng người"),
		h("ul", { class: "people" }, others.map(person)),
		me
			? h(
					"p",
					{ class: "note" },
					`Phần của ${me.member.name}: ${formatVnd(me.share)} · đã trả ${formatVnd(me.paid)}. Số tiền mỗi người đã làm tròn đến nghìn đồng.`,
				)
			: null,
		h("h2", null, "Các khoản chi"),
		expenseList(trip),
		h(
			"div",
			{ class: "total-row" },
			h("span", null, "Tổng chi"),
			h("strong", null, formatVnd(s.total)),
		),
		h(
			"button",
			{ class: "block", type: "button", onclick: () => copy(groupMessage(trip)) },
			"Sao chép tóm tắt gửi nhóm",
		),
		bankLine(),
	];
}

window.addEventListener("hashchange", render);
render();
