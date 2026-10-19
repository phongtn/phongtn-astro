// VietQR (NAPAS) payload for a bank transfer, following the EMVCo merchant-presented QR format.

const NAPAS_GUID = "A000000727";
const TRANSFER_TO_ACCOUNT = "QRIBFTTA";
export const MEMO_MAX = 25;

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE, as required by EMVCo field 63. */
export function crc16(data: string): string {
	let crc = 0xffff;
	for (let i = 0; i < data.length; i++) {
		crc ^= data.charCodeAt(i) << 8;
		for (let bit = 0; bit < 8; bit++) {
			crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
		}
	}
	return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Strips Vietnamese diacritics and anything banks reject in a transfer note. */
export function toMemo(text: string, max = MEMO_MAX): string {
	return text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/đ/g, "d")
		.replace(/Đ/g, "D")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, " ")
		.trim()
		.slice(0, max)
		.trim();
}

export interface VietQrInput {
	bin: string;
	account: string;
	/** Integer VND; omit for a QR without a preset amount. */
	amount?: number;
	memo?: string;
}

export function buildVietQr({ bin, account, amount, memo }: VietQrInput): string {
	const beneficiary = tlv("00", bin) + tlv("01", account);
	const merchant = tlv("00", NAPAS_GUID) + tlv("01", beneficiary) + tlv("02", TRANSFER_TO_ACCOUNT);
	let payload =
		tlv("00", "01") + tlv("01", amount ? "12" : "11") + tlv("38", merchant) + tlv("53", "704");
	if (amount) payload += tlv("54", String(amount));
	payload += tlv("58", "VN");
	if (memo) payload += tlv("62", tlv("08", memo));
	payload += "6304";
	return payload + crc16(payload);
}
