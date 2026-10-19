import { upstashKv } from "../../src/apps/chia/kv-upstash";
import { createApi } from "../../src/apps/chia/share-server";

const api = createApi(upstashKv(), process.env);

/** SePay "Có tiền vào" webhook: marks members as paid when their CHIA code arrives. */
export function POST(request: Request): Promise<Response> {
	return api.sepayWebhook(request);
}
