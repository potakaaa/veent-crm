// Echo back only same-origin relative paths. Reject anything that could be an
// open redirect / off-origin target: empty, missing leading slash, protocol-relative
// (`//`), backslash-relative (`/\`), or anything carrying a scheme (`:`).
export function sanitizeFrom(raw: string | null): string | null {
	if (!raw) return null;
	if (!raw.startsWith('/')) return null;
	if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
	if (raw.includes(':')) return null;
	return raw;
}
