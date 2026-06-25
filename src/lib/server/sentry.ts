// Sentry — STUB for v0. See sales-crm.md §Security & privacy.
// Real init uses @sentry/sveltekit with sendDefaultPii:false + body/email scrubbing (prospect PII).
// No SENTRY_DSN is wired in this skeleton.

// TODO(sentry): in hooks.server.ts / hooks.client.ts call Sentry.init({
//   dsn: env.SENTRY_DSN, sendDefaultPii: false, beforeSend: scrubBodiesAndEmails })
export function initSentry(): void {
	// STUB: no-op until SENTRY_DSN is provided.
}
