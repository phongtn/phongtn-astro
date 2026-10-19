export type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
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

export function present(children: Child[]): (Node | string)[] {
	return children.filter((c): c is Node | string => Boolean(c));
}

let toastTimer = 0;
const toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite" });
export function toast(message: string) {
	(document.querySelector("dialog[open]") ?? document.body).append(toastEl);
	toastEl.textContent = message;
	toastEl.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 2800);
}

export async function copy(text: string, done = "Đã sao chép") {
	try {
		await navigator.clipboard.writeText(text);
		toast(done);
	} catch {
		toast("Không sao chép được trên trình duyệt này");
	}
}

export function field(label: string, control: HTMLElement, hint?: string) {
	return h(
		"div",
		{ class: "field" },
		h("label", { for: control.id }, label),
		control,
		hint ? h("p", { class: "hint" }, hint) : null,
	);
}

export function openDialog(title: string, body: Child[], onClose?: () => void) {
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

export const canShareFile = (file: File) =>
	typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

/** Opens the share sheet for an image (where "Save image" lands it in Photos), else downloads it. */
export async function shareOrDownload(file: File, title: string) {
	if (canShareFile(file)) {
		try {
			await navigator.share({ files: [file], title });
		} catch (err) {
			if (!(err instanceof DOMException && err.name === "AbortError"))
				toast("Không chia sẻ được ảnh.");
		}
		return;
	}
	const url = URL.createObjectURL(file);
	const a = h("a", { href: url, download: file.name });
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
