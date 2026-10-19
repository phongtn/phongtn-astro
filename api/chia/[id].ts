import { upstashKv } from "../../src/apps/chia/kv-upstash";
import { createApi } from "../../src/apps/chia/share-server";

const api = createApi(upstashKv(), process.env);
/** Vercel rewrites /api/chia/<id> to this file with ?id=<id>; fall back to the path for local runs. */
function idOf(request: Request): string {
	const url = new URL(request.url);
	return url.searchParams.get("id") ?? url.pathname.split("/").filter(Boolean).pop() ?? "";
}

export function GET(request: Request): Promise<Response> {
	return api.get(idOf(request));
}

export function PUT(request: Request): Promise<Response> {
	return api.update(request, idOf(request));
}

export function DELETE(request: Request): Promise<Response> {
	return api.remove(request, idOf(request));
}
