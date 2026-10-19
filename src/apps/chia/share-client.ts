import type { Payment, SharedView } from "./share-server";
import { isObject, isString, readBank, readTrip } from "./store";
import type { BankAccount, ShareInfo, Trip } from "./types";

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

async function call(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
	let res: Response;
	try {
		res = await fetch(path, {
			...init,
			headers: { "content-type": "application/json", ...init.headers },
		});
	} catch {
		throw new ApiError(0, "Không kết nối được máy chủ, hãy kiểm tra mạng.");
	}
	const data: unknown = await res.json().catch(() => null);
	const body = isObject(data) ? data : {};
	if (!res.ok)
		throw new ApiError(res.status, isString(body.error) ? body.error : "Máy chủ đang lỗi.");
	return body;
}

const readCodes = (v: unknown): Record<string, string> =>
	isObject(v)
		? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => isString(e[1])))
		: {};

/** The JSON body for creating or updating the shared copy; also used to detect unsynced changes. */
export const snapshotOf = (trip: Trip, bank: BankAccount) =>
	JSON.stringify({ trip: { ...trip, share: null, received: {} }, bank });

export async function createShare(snapshot: string): Promise<ShareInfo> {
	const body = await call("/api/chia", { method: "POST", body: snapshot });
	if (!isString(body.id) || !isString(body.token) || typeof body.expiresAt !== "number") {
		throw new ApiError(500, "Máy chủ trả về dữ liệu lạ.");
	}
	return {
		id: body.id,
		token: body.token,
		expiresAt: body.expiresAt,
		codes: readCodes(body.codes),
		autoConfirm: body.autoConfirm === true,
	};
}

export async function updateShare(
	share: ShareInfo,
	snapshot: string,
): Promise<{ codes: Record<string, string>; autoConfirm: boolean }> {
	const body = await call(`/api/chia/${share.id}`, {
		method: "PUT",
		body: snapshot,
		headers: { authorization: `Bearer ${share.token}` },
	});
	return { codes: readCodes(body.codes), autoConfirm: body.autoConfirm === true };
}

export async function deleteShare(share: ShareInfo): Promise<void> {
	await call(`/api/chia/${share.id}`, {
		method: "DELETE",
		headers: { authorization: `Bearer ${share.token}` },
	});
}

function readPayments(v: unknown): Record<string, Payment> {
	if (!isObject(v)) return {};
	const payments: Record<string, Payment> = {};
	for (const [id, p] of Object.entries(v)) {
		if (isObject(p) && Number.isSafeInteger(p.amount)) {
			payments[id] = { amount: p.amount as number, at: isString(p.at) ? p.at : "" };
		}
	}
	return payments;
}

export async function fetchShare(id: string): Promise<SharedView> {
	const body = await call(`/api/chia/${encodeURIComponent(id)}`);
	const trip = readTrip(body.trip);
	const bank = readBank(body.bank);
	const num = (v: unknown) => (typeof v === "number" ? v : 0);
	if (!trip || !bank) throw new ApiError(500, "Máy chủ trả về dữ liệu lạ.");
	return {
		id,
		trip,
		bank,
		codes: readCodes(body.codes),
		payments: readPayments(body.payments),
		createdAt: num(body.createdAt),
		expiresAt: num(body.expiresAt),
		updatedAt: num(body.updatedAt),
		autoConfirm: body.autoConfirm === true,
	};
}
