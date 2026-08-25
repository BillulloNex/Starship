import { describe, expect, it } from "bun:test";
import { Lru } from "../../src/utils/lru";

describe("Lru Cache", () => {
	it("should store and retrieve values", () => {
		const cache = new Lru<string, number>(2);
		cache.set("a", 1);
		expect(cache.get("a")).toBe(1);
	});

	it("should evict least recently used items when capacity is exceeded", () => {
		const cache = new Lru<string, number>(2);
		cache.set("a", 1);
		cache.set("b", 2);
		cache.set("c", 3); // This should evict "a"

		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBe(2);
		expect(cache.get("c")).toBe(3);
		expect(cache.size).toBe(2);
	});

	it("should update recent usage on get", () => {
		const cache = new Lru<string, number>(2);
		cache.set("a", 1);
		cache.set("b", 2);

		// Access "a" so it becomes most recently used
		cache.get("a");

		cache.set("c", 3); // This should evict "b" since "a" was just accessed

		expect(cache.get("b")).toBeUndefined();
		expect(cache.get("a")).toBe(1);
		expect(cache.get("c")).toBe(3);
	});

	it("should handle overwrite correctly", () => {
		const cache = new Lru<string, number>(2);
		cache.set("a", 1);
		cache.set("a", 100);

		expect(cache.get("a")).toBe(100);
		expect(cache.size).toBe(1);
	});
});
