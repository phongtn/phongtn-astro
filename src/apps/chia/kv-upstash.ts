import { Redis } from "@upstash/redis";
import type { Kv } from "./share-server";

/**
 * Upstash Redis, from the env vars Vercel's Upstash integration injects.
 * Returns null until the store is connected, so the API can answer with a clear 503.
 */
export function upstashKv(env: Record<string, string | undefined> = process.env): Kv | null {
	const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
	const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
	if (!url || !token) return null;
	const redis = new Redis({ url, token, automaticDeserialization: false });
	return {
		get: (key) => redis.get<string>(key),
		async set(key, value, { ex, nx } = {}) {
			let result: unknown;
			if (ex !== undefined && nx) result = await redis.set(key, value, { ex, nx: true });
			else if (ex !== undefined) result = await redis.set(key, value, { ex });
			else if (nx) result = await redis.set(key, value, { nx: true });
			else result = await redis.set(key, value);
			return result === "OK";
		},
		async del(...keys) {
			if (keys.length) await redis.del(...keys);
		},
		hincrby: (key, field, by) => redis.hincrby(key, field, by),
		async hset(key, field, value) {
			await redis.hset(key, { [field]: value });
		},
		async hgetall(key) {
			// Without automatic deserialization the client hands back Redis' flat [field, value, …] reply.
			const raw: unknown = await redis.hgetall(key);
			const pairs: [string, unknown][] = Array.isArray(raw)
				? Array.from({ length: Math.floor(raw.length / 2) }, (_, i) => [
						String(raw[2 * i]),
						raw[2 * i + 1],
					])
				: raw && typeof raw === "object"
					? Object.entries(raw)
					: [];
			return Object.fromEntries(pairs.map(([field, value]) => [field, String(value)]));
		},
		async expireat(key, unixSeconds) {
			await redis.expireat(key, unixSeconds);
		},
	};
}
