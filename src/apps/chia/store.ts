import type { BankAccount, Expense, Member, Profile, Store, Trip } from "./types";

const KEY = "chia-v1";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string";
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

function readMember(v: unknown): Member | null {
	return isObject(v) && isString(v.id) && isString(v.name) ? { id: v.id, name: v.name } : null;
}

function readExpense(v: unknown): Expense | null {
	if (!isObject(v) || !isString(v.id) || !isString(v.name) || !isString(v.payerId)) return null;
	if (!Number.isSafeInteger(v.amount) || (v.amount as number) <= 0) return null;
	if (!isStringArray(v.participantIds)) return null;
	return {
		id: v.id,
		name: v.name,
		amount: v.amount as number,
		payerId: v.payerId,
		participantIds: v.participantIds,
	};
}

function readTrip(v: unknown): Trip | null {
	if (!isObject(v) || !isString(v.id) || !isString(v.name) || !isString(v.organizerId)) return null;
	if (!Array.isArray(v.members) || !Array.isArray(v.expenses)) return null;
	const members = v.members.map(readMember).filter((m): m is Member => m !== null);
	if (!members.some((m) => m.id === v.organizerId)) return null;
	return {
		id: v.id,
		name: v.name,
		createdAt: typeof v.createdAt === "number" ? v.createdAt : Date.now(),
		organizerId: v.organizerId,
		members,
		expenses: v.expenses.map(readExpense).filter((e): e is Expense => e !== null),
		settled: isStringArray(v.settled) ? v.settled : [],
	};
}

function readBank(v: unknown): BankAccount | null {
	return isObject(v) && isString(v.bin) && isString(v.account) && isString(v.holder)
		? { bin: v.bin, account: v.account, holder: v.holder }
		: null;
}

function readProfile(v: unknown): Profile {
	return isObject(v)
		? { name: isString(v.name) ? v.name : "", bank: readBank(v.bank) }
		: { name: "", bank: null };
}

export function load(): Store {
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
		if (!isObject(raw)) throw new Error("bad store");
		const trips = Array.isArray(raw.trips) ? raw.trips.map(readTrip) : [];
		return { profile: readProfile(raw.profile), trips: trips.filter((t): t is Trip => t !== null) };
	} catch {
		return { profile: { name: "", bank: null }, trips: [] };
	}
}

/** Returns false when the browser refuses to store (private mode, quota, blocked storage). */
export function save(store: Store): boolean {
	try {
		localStorage.setItem(KEY, JSON.stringify(store));
		return true;
	} catch {
		return false;
	}
}

export const newId = () =>
	Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
