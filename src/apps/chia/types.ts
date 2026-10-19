export interface Member {
	id: string;
	name: string;
}

export interface Expense {
	id: string;
	name: string;
	/** Integer VND. */
	amount: number;
	payerId: string;
	participantIds: string[];
}

export interface Trip {
	id: string;
	name: string;
	createdAt: number;
	organizerId: string;
	members: Member[];
	expenses: Expense[];
	/** Member ids the organizer marked as settled by hand (cash, refunds). */
	settled: string[];
	share: ShareInfo | null;
	/** Transfers SePay matched, per member id; copied from the link so they outlive its expiry. */
	received: Record<string, number>;
}

/** The group's read-only link, as known to the organizer's device. */
export interface ShareInfo {
	id: string;
	/** Secret that lets this device update or delete the shared copy. */
	token: string;
	expiresAt: number;
	/** Payment code per member id, e.g. "CHIA483920"; put in the transfer note so SePay can match it. */
	codes: Record<string, string>;
	/** True when incoming transfers to this account are confirmed automatically (SePay). */
	autoConfirm: boolean;
}

export interface BankAccount {
	bin: string;
	account: string;
	holder: string;
}

export interface Profile {
	name: string;
	bank: BankAccount | null;
}

export interface Store {
	profile: Profile;
	trips: Trip[];
}
