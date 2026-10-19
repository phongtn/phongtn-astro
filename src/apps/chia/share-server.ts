// Server side of the /chia group link and of the SePay payment webhook.
// Runs as Vercel functions (see /api); storage is any Redis-like Kv (Upstash in production).

import { isObject, isString, readBank, readTrip } from "./store";
import type { BankAccount, Trip } from "./types";

export const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MAX_BODY_BYTES = 32 * 1024;
/** Matches the payment code structure configured in SePay: prefix CHIA + 2–6 digits. */
const CODE_PATTERN = /CHIA\d{2,6}/i;
const ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export interface SetOptions {
	ex?: number;
	nx?: boolean;
}

export interface Kv {
	get(key: string): Promise<string | null>;
	/** Returns false when `nx` is set and the key already exists. */
	set(key: string, value: string, options?: SetOptions): Promise<boolean>;
	del(...keys: string[]): Promise<void>;
	hincrby(key: string, field: string, by: number): Promise<number>;
	hset(key: string, field: string, value: string): Promise<void>;
	hgetall(key: string): Promise<Record<string, string>>;
	expireat(key: string, unixSeconds: number): Promise<void>;
}

/**
 * Server env: SEPAY_API_KEY (the key SePay sends as "Apikey …") and SEPAY_ACCOUNTS
 * (account numbers whose incoming transfers SePay reports, comma separated).
 */
export type Env = Record<string, string | undefined>;

export interface Payment {
	amount: number;
	/** ISO time the latest transfer was recorded. */
	at: string;
}

/** What anyone holding the link can read. */
export interface SharedView {
	id: string;
	trip: Trip;
	bank: BankAccount;
	codes: Record<string, string>;
	payments: Record<string, Payment>;
	createdAt: number;
	expiresAt: number;
	updatedAt: number;
	autoConfirm: boolean;
}

interface ShareRecord {
	trip: Trip;
	bank: BankAccount;
	codes: Record<string, string>;
	tokenHash: string;
	createdAt: number;
	expiresAt: number;
	updatedAt: number;
}

class HttpError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

const shareKey = (id: string) => `chia:share:${id}`;
const payKey = (id: string) => `chia:pay:${id}`;
const codeKey = (code: string) => `chia:code:${code}`;
const txKey = (id: string) => `chia:sepay:${id}`;

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});
}

const fail = (status: number, error: string) => json(status, { error });

function randomString(length: number, alphabet: string): string {
	return Array.from(
		crypto.getRandomValues(new Uint8Array(length)),
		(b) => alphabet[b % alphabet.length],
	).join("");
}

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
	Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(text: string): Promise<string> {
	return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Compares secrets without returning early on the first differing character. */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

async function readJson(request: Request): Promise<unknown> {
	const text = await request.text();
	if (new TextEncoder().encode(text).length > MAX_BODY_BYTES)
		throw new HttpError(413, "Dữ liệu quá lớn.");
	try {
		return JSON.parse(text);
	} catch {
		throw new HttpError(400, "Dữ liệu không hợp lệ.");
	}
}

function readPayload(v: unknown): { trip: Trip; bank: BankAccount } {
	const trip = isObject(v) ? readTrip(v.trip) : null;
	const bank = isObject(v) ? readBank(v.bank) : null;
	if (!trip || !bank) throw new HttpError(400, "Dữ liệu chuyến đi không hợp lệ.");
	if (
		!/^\d{6}$/.test(bank.bin) ||
		!/^[A-Z0-9]{4,19}$/.test(bank.account) ||
		bank.holder.length > 50
	) {
		throw new HttpError(400, "Tài khoản nhận tiền không hợp lệ.");
	}
	const texts = [
		trip.name,
		...trip.members.map((m) => m.name),
		...trip.expenses.map((e) => e.name),
	];
	if (trip.members.length > 50 || trip.expenses.length > 500 || texts.some((s) => s.length > 80)) {
		throw new HttpError(400, "Chuyến đi quá lớn.");
	}
	return { trip: { ...trip, share: null, received: {} }, bank };
}

function autoConfirm(env: Env, bank: BankAccount): boolean {
	const accounts = (env.SEPAY_ACCOUNTS ?? "").split(/[\s,;]+/).filter(Boolean);
	return Boolean(env.SEPAY_API_KEY) && accounts.includes(bank.account);
}

async function claimCode(kv: Kv, shareId: string, ttl: number): Promise<string> {
	for (let attempt = 0; attempt < 20; attempt++) {
		const code = `CHIA${randomString(6, "0123456789")}`;
		if (await kv.set(codeKey(code), shareId, { nx: true, ex: ttl })) return code;
	}
	throw new HttpError(503, "Không cấp được mã thanh toán, hãy thử lại.");
}

/** Keeps each member's existing code, gives new members one, and frees the codes of removed members. */
async function assignCodes(
	kv: Kv,
	shareId: string,
	trip: Trip,
	existing: Record<string, string>,
	ttl: number,
): Promise<Record<string, string>> {
	const codes: Record<string, string> = {};
	for (const member of trip.members) {
		if (member.id === trip.organizerId) continue;
		codes[member.id] = existing[member.id] ?? (await claimCode(kv, shareId, ttl));
	}
	const freed = Object.entries(existing)
		.filter(([memberId]) => !(memberId in codes))
		.map(([, code]) => codeKey(code));
	if (freed.length) await kv.del(...freed);
	return codes;
}

function readPayments(hash: Record<string, string>): Record<string, Payment> {
	const payments: Record<string, Payment> = {};
	for (const [field, value] of Object.entries(hash)) {
		if (field.endsWith("@")) continue;
		const amount = Number(value);
		if (Number.isSafeInteger(amount)) payments[field] = { amount, at: hash[`${field}@`] ?? "" };
	}
	return payments;
}

interface Transaction {
	id: string;
	incoming: boolean;
	amount: number;
	code: string | null;
}

function readTransaction(v: unknown): Transaction | null {
	if (!isObject(v)) return null;
	const id = typeof v.id === "number" || isString(v.id) ? String(v.id) : "";
	const amount = Number(v.transferAmount);
	if (!id || !Number.isFinite(amount)) return null;
	const text = [v.code, v.content, v.description].filter(isString).join(" ");
	return {
		id,
		incoming: v.transferType === "in",
		amount: Math.round(amount),
		code: CODE_PATTERN.exec(text)?.[0].toUpperCase() ?? null,
	};
}

export function createApi(kv: Kv | null, env: Env, now: () => number = Date.now) {
	const run = async (handler: (kv: Kv) => Promise<Response>): Promise<Response> => {
		if (!kv) return fail(503, "Chưa cài đặt kho lưu link (Upstash Redis) trên Vercel.");
		try {
			return await handler(kv);
		} catch (error) {
			if (error instanceof HttpError) return fail(error.status, error.message);
			console.error(error);
			return fail(500, "Lỗi máy chủ, hãy thử lại.");
		}
	};

	const load = async (kv: Kv, id: string): Promise<ShareRecord> => {
		const raw = ID_PATTERN.test(id) ? await kv.get(shareKey(id)) : null;
		const v: unknown = raw ? JSON.parse(raw) : null;
		const trip = isObject(v) ? readTrip(v.trip) : null;
		const bank = isObject(v) ? readBank(v.bank) : null;
		if (
			!isObject(v) ||
			!trip ||
			!bank ||
			!isString(v.tokenHash) ||
			typeof v.expiresAt !== "number"
		) {
			throw new HttpError(404, "Link đã hết hạn hoặc không tồn tại.");
		}
		if (v.expiresAt <= now()) throw new HttpError(404, "Link đã hết hạn hoặc không tồn tại.");
		const codes = isObject(v.codes)
			? Object.fromEntries(
					Object.entries(v.codes).filter((e): e is [string, string] => isString(e[1])),
				)
			: {};
		return {
			trip,
			bank,
			codes,
			tokenHash: v.tokenHash,
			createdAt:
				typeof v.createdAt === "number" ? v.createdAt : v.expiresAt - SHARE_TTL_SECONDS * 1000,
			expiresAt: v.expiresAt,
			updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : v.expiresAt,
		};
	};

	const authorize = async (request: Request, record: ShareRecord) => {
		const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
		if (!token || !safeEqual(await sha256(token), record.tokenHash)) {
			throw new HttpError(401, "Không có quyền sửa link này.");
		}
	};

	/** Seconds until the link expires; updates never extend the 7 days counted from creation. */
	const ttlOf = (record: ShareRecord) => Math.max(1, Math.ceil((record.expiresAt - now()) / 1000));

	return {
		create: (request: Request) =>
			run(async (kv) => {
				const { trip, bank } = readPayload(await readJson(request));
				const id = randomString(12, ID_ALPHABET);
				const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
				const createdAt = now();
				const expiresAt = createdAt + SHARE_TTL_SECONDS * 1000;
				const codes = await assignCodes(kv, id, trip, {}, SHARE_TTL_SECONDS);
				const record: ShareRecord = {
					trip,
					bank,
					codes,
					tokenHash: await sha256(token),
					createdAt,
					expiresAt,
					updatedAt: createdAt,
				};
				await kv.set(shareKey(id), JSON.stringify(record), { ex: SHARE_TTL_SECONDS });
				return json(201, { id, token, expiresAt, codes, autoConfirm: autoConfirm(env, bank) });
			}),

		get: (id: string) =>
			run(async (kv) => {
				const record = await load(kv, id);
				const view: SharedView = {
					id,
					trip: record.trip,
					bank: record.bank,
					codes: record.codes,
					payments: readPayments(await kv.hgetall(payKey(id))),
					createdAt: record.createdAt,
					expiresAt: record.expiresAt,
					updatedAt: record.updatedAt,
					autoConfirm: autoConfirm(env, record.bank),
				};
				return json(200, view);
			}),

		update: (request: Request, id: string) =>
			run(async (kv) => {
				const record = await load(kv, id);
				await authorize(request, record);
				const { trip, bank } = readPayload(await readJson(request));
				const codes = await assignCodes(kv, id, trip, record.codes, ttlOf(record));
				const next: ShareRecord = { ...record, trip, bank, codes, updatedAt: now() };
				await kv.set(shareKey(id), JSON.stringify(next), { ex: ttlOf(record) });
				return json(200, {
					expiresAt: record.expiresAt,
					codes,
					autoConfirm: autoConfirm(env, bank),
				});
			}),

		remove: (request: Request, id: string) =>
			run(async (kv) => {
				const record = await load(kv, id);
				await authorize(request, record);
				await kv.del(shareKey(id), payKey(id), ...Object.values(record.codes).map(codeKey));
				return json(200, { ok: true });
			}),

		/** SePay calls this for every transaction; answer {success: true} unless it should retry. */
		sepayWebhook: async (request: Request): Promise<Response> => {
			if (!env.SEPAY_API_KEY) return fail(503, "Chưa cấu hình SEPAY_API_KEY.");
			if (!safeEqual(request.headers.get("authorization") ?? "", `Apikey ${env.SEPAY_API_KEY}`)) {
				return fail(401, "Sai khoá API.");
			}
			return run(async (kv) => {
				const tx = readTransaction(await readJson(request));
				if (!tx) return fail(400, "Dữ liệu giao dịch không hợp lệ.");
				const ok = json(200, { success: true });
				if (!tx.incoming || tx.amount <= 0 || !tx.code) return ok;
				const shareId = await kv.get(codeKey(tx.code));
				const record = shareId ? await load(kv, shareId).catch(() => null) : null;
				const memberId = Object.entries(record?.codes ?? {}).find(([, c]) => c === tx.code)?.[0];
				// Unknown or expired code: acknowledge so SePay does not keep retrying.
				if (!shareId || !record || !memberId) return ok;
				// SePay may deliver the same transaction more than once.
				if (!(await kv.set(txKey(tx.id), "1", { nx: true, ex: SHARE_TTL_SECONDS }))) return ok;
				try {
					await kv.hset(payKey(shareId), `${memberId}@`, new Date(now()).toISOString());
					await kv.expireat(payKey(shareId), Math.ceil(record.expiresAt / 1000));
					// Last write, so a failure before it can be retried without counting twice.
					await kv.hincrby(payKey(shareId), memberId, tx.amount);
				} catch (error) {
					await kv.del(txKey(tx.id)).catch(() => undefined);
					throw error;
				}
				return ok;
			});
		},
	};
}
