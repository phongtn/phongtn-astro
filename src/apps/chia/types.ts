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
	/** Member ids that have settled up with the organizer. */
	settled: string[];
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
