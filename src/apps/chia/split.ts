import { roundThousand } from "./money";
import type { Expense, Member, Trip } from "./types";

export interface ShareLine {
	expense: Expense;
	/** How many people this expense is split between. */
	count: number;
	share: number;
}

export interface Balance {
	member: Member;
	isOrganizer: boolean;
	/** Total of this member's shares. */
	share: number;
	/** Total this member paid out of pocket. */
	paid: number;
	/** share - paid, exact. Positive: owes the organizer. Negative: the organizer pays back. */
	net: number;
	/** net rounded to 1,000đ; what actually changes hands. Always 0 for the organizer. */
	due: number;
	lines: ShareLine[];
	paidExpenses: Expense[];
}

export interface Settlement {
	total: number;
	balances: Balance[];
	/** Sum of positive dues: what the organizer collects. */
	toCollect: number;
	/** Sum of negative dues: what the organizer pays back. */
	toRefund: number;
}

/** Ids of the members an expense is split between, in member order. Empty selection means everyone. */
export function participantsOf(trip: Trip, expense: Expense): string[] {
	const ids = trip.members.filter((m) => expense.participantIds.includes(m.id)).map((m) => m.id);
	return ids.length ? ids : trip.members.map((m) => m.id);
}

/**
 * Every member settles with the organizer only (hub model): no member-to-member transfers.
 * Shares are exact integers; leftover đồng go one each to the first participants.
 */
export function computeSettlement(trip: Trip): Settlement {
	const memberIds = new Set(trip.members.map((m) => m.id));
	const balances = new Map<string, Balance>(
		trip.members.map((member) => [
			member.id,
			{
				member,
				isOrganizer: member.id === trip.organizerId,
				share: 0,
				paid: 0,
				net: 0,
				due: 0,
				lines: [],
				paidExpenses: [],
			},
		]),
	);

	let total = 0;
	for (const expense of trip.expenses) {
		total += expense.amount;
		const payer = balances.get(memberIds.has(expense.payerId) ? expense.payerId : trip.organizerId);
		if (payer) {
			payer.paid += expense.amount;
			payer.paidExpenses.push(expense);
		}
		const ids = participantsOf(trip, expense);
		const base = Math.floor(expense.amount / ids.length);
		let remainder = expense.amount - base * ids.length;
		for (const id of ids) {
			const share = base + (remainder > 0 ? 1 : 0);
			if (remainder > 0) remainder--;
			const balance = balances.get(id);
			if (!balance) continue;
			balance.share += share;
			balance.lines.push({ expense, count: ids.length, share });
		}
	}

	let toCollect = 0;
	let toRefund = 0;
	for (const balance of balances.values()) {
		balance.net = balance.share - balance.paid;
		if (balance.isOrganizer) continue;
		balance.due = roundThousand(balance.net);
		if (balance.due > 0) toCollect += balance.due;
		else toRefund -= balance.due;
	}

	return { total, balances: [...balances.values()], toCollect, toRefund };
}
