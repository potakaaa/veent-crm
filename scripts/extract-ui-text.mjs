#!/usr/bin/env node
// Extracts all user-visible text strings from .svelte files under src/
// Prints: FILE:LINE  TEXT
// Run: bun scripts/extract-ui-text.mjs

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

// Also check lib/components for shared UI text
const SEARCH_DIRS = [join(SRC, 'routes'), join(SRC, 'lib/components')];

function walk(dir) {
	const files = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) files.push(...walk(full));
		else if (entry.endsWith('.svelte')) files.push(full);
	}
	return files;
}

// Strip <script> and <style> blocks — we only care about the template
function stripNonTemplate(src) {
	// Replace script/style blocks with blank lines to preserve line numbers
	return src
		.replace(/<script[\s\S]*?<\/script>/g, (m) => '\n'.repeat(m.split('\n').length - 1))
		.replace(/<style[\s\S]*?<\/style>/g, (m) => '\n'.repeat(m.split('\n').length - 1));
}

// Patterns for user-visible text
const PATTERNS = [
	// Raw text between tags (not empty, not pure whitespace, not {expr})
	{ name: 'text', re: />([^<>{}\n][^<>{}]*?)</g, group: 1 },
	// title="..." subtitle="..." placeholder="..." label="..." description="..."
	{
		name: 'prop',
		re: /(?:title|subtitle|placeholder|label|description|alt|aria-label)="([^"]{4,})"/g,
		group: 1
	},
	// Template literal props: title={`...`}
	{
		name: 'tmpl',
		re: /(?:title|subtitle|placeholder|label|description)=\{`([^`]{4,})`\}/g,
		group: 1
	},
	// Straight string props with single quotes
	{ name: 'prop1', re: /(?:title|subtitle|placeholder|label|description)='([^']{4,})'/g, group: 1 }
];

const SKIP_RE = [
	/^\s*$/, // blank
	/^[{()\[\].,;:!?|\/\\<>@#$%^&*+=~`]+$/, // punctuation/symbols only
	/^[\d\s\-–—.,:]+$/, // numbers/punctuation only
	/^https?:\/\//, // URLs
	/^\{.*\}$/, // pure expressions
	/^<!--/, // comments
	/class=/, // class attributes
	/^</ // tags
];

const results = [];

for (const dir of SEARCH_DIRS) {
	for (const file of walk(dir)) {
		const rel = relative(ROOT, file);
		const raw = readFileSync(file, 'utf8');
		const src = stripNonTemplate(raw);
		const lines = src.split('\n');

		for (const { re } of PATTERNS) {
			re.lastIndex = 0;
			let m;
			while ((m = re.exec(src)) !== null) {
				const text = m[1].trim().replace(/\s+/g, ' ');
				if (!text || SKIP_RE.some((r) => r.test(text))) continue;
				if (text.length < 4) continue;

				// Find line number from char offset
				const before = src.slice(0, m.index);
				const line = before.split('\n').length;

				results.push({ file: rel, line, text });
			}
		}
	}
}

// Deduplicate by file+line (multiple patterns can match same location)
const seen = new Set();
const deduped = results.filter(({ file, line, text }) => {
	const key = `${file}:${line}:${text}`;
	if (seen.has(key)) return false;
	seen.add(key);
	return true;
});

// Sort by file then line
deduped.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

// Group by file
let lastFile = '';
for (const { file, line, text } of deduped) {
	if (file !== lastFile) {
		console.log(`\n── ${file}`);
		lastFile = file;
	}
	console.log(`  ${String(line).padStart(4)}  ${text}`);
}

console.log(`\n${deduped.length} strings across ${new Set(deduped.map((r) => r.file)).size} files`);
