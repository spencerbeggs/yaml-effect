/**
 * Test data loader for the official yaml-test-suite.
 *
 * Reads raw fixture files from the git submodule at
 * `__test__/fixtures/yaml-test-suite/` (pinned to data-2022-01-17).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/** Root directory of the yaml-test-suite data checkout. */
export const SUITE_DIR = resolve(import.meta.dirname, "../fixtures/yaml-test-suite");

/** A single yaml-test-suite test case. */
export interface TestCase {
	/** 4-character test ID (e.g., "229Q"). */
	id: string;
	/** Human-readable test name from the `===` file. */
	name: string;
	/** Raw YAML input from `in.yaml`. */
	yaml: string;
	/** Expected parse event stream from `test.event`. */
	events: string;
	/** Parsed expected JSON output (if `in.json` exists). */
	json?: unknown;
	/** Expected re-serialized YAML (if `out.yaml` exists). */
	outYaml?: string | undefined;
	/** True if the `error` file is present (YAML should be rejected). */
	isError: boolean;
}

/**
 * Parse a JSON file that may contain multiple top-level JSON values
 * (one per YAML document in multi-document streams).
 * Returns a single value if there's only one, or an array of values.
 */
function parseMultiJson(text: string): unknown {
	const values: unknown[] = [];
	let remaining = text.trim();

	while (remaining.length > 0) {
		try {
			const value = JSON.parse(remaining);
			values.push(value);
			break;
		} catch {
			// Try to find where the first JSON value ends
			// by incrementally parsing longer substrings
			let found = false;
			for (let i = 1; i <= remaining.length; i++) {
				try {
					const value = JSON.parse(remaining.slice(0, i));
					values.push(value);
					remaining = remaining.slice(i).trim();
					found = true;
					break;
				} catch {
					// continue
				}
			}
			if (!found) break;
		}
	}

	return values.length === 1 ? values[0] : values;
}

/**
 * Load a single test case from a directory that contains `in.yaml`, `===`, etc.
 */
function loadFromDir(dir: string, id: string): TestCase | null {
	const inYamlPath = join(dir, "in.yaml");
	if (!existsSync(inYamlPath)) return null;

	const yaml = readFileSync(inYamlPath, "utf-8");
	const name = existsSync(join(dir, "===")) ? readFileSync(join(dir, "==="), "utf-8").trim() : id;
	const events = existsSync(join(dir, "test.event")) ? readFileSync(join(dir, "test.event"), "utf-8") : "";
	const isError = existsSync(join(dir, "error"));

	let json: unknown;
	const jsonPath = join(dir, "in.json");
	if (existsSync(jsonPath)) {
		json = parseMultiJson(readFileSync(jsonPath, "utf-8"));
	}

	let outYaml: string | undefined;
	const outPath = join(dir, "out.yaml");
	if (existsSync(outPath)) {
		outYaml = readFileSync(outPath, "utf-8");
	}

	return { id, name, yaml, events, json, outYaml, isError };
}

/**
 * Load all test cases from the yaml-test-suite data directory.
 *
 * Handles both flat test directories (e.g., `229Q/in.yaml`) and
 * multi-case directories with numbered subdirectories (e.g., `3RLN/00/`, `3RLN/01/`).
 */
export function loadAllTestCases(): TestCase[] {
	if (!existsSync(SUITE_DIR)) {
		throw new Error(`yaml-test-suite not found at ${SUITE_DIR}. Run: git submodule update --init`);
	}

	const cases: TestCase[] = [];
	const entries = readdirSync(SUITE_DIR, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const dir = join(SUITE_DIR, entry.name);

		// Try loading directly from this directory (flat test)
		const flat = loadFromDir(dir, entry.name);
		if (flat) {
			cases.push(flat);
			continue;
		}

		// Otherwise check for numbered subdirectories (multi-case test)
		const subEntries = readdirSync(dir, { withFileTypes: true });
		for (const sub of subEntries) {
			if (!sub.isDirectory()) continue;
			const subDir = join(dir, sub.name);
			const subCase = loadFromDir(subDir, `${entry.name}/${sub.name}`);
			if (subCase) {
				cases.push(subCase);
			}
		}
	}

	return cases.sort((a, b) => a.id.localeCompare(b.id));
}
