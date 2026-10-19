import { upstashKv } from "../../src/apps/chia/kv-upstash";
import { createApi } from "../../src/apps/chia/share-server";

const api = createApi(upstashKv(), process.env);

/** Creates the group's read-only link for a trip. */
export function POST(request: Request): Promise<Response> {
	return api.create(request);
}
