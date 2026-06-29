/**
 * Transient toast/undo notifications. Svelte 5 runes module-state store.
 *
 * Usage: `import { toasts } from '$lib/stores/toasts.svelte';`
 *        `toasts.push('Claimed lead', { action: { label: 'Undo', run: ... } })`
 */
export interface Toast {
	id: number;
	message: string;
	tone: 'default' | 'success' | 'warn';
	action?: { label: string; run: () => void };
}

let seq = 0;

class ToastStore {
	items = $state<Toast[]>([]);

	push(
		message: string,
		opts: { tone?: Toast['tone']; action?: Toast['action']; timeout?: number } = {}
	) {
		const id = ++seq;
		this.items = [
			...this.items,
			{ id, message, tone: opts.tone ?? 'default', action: opts.action }
		];
		const timeout = opts.timeout ?? 4000;
		if (timeout > 0 && typeof window !== 'undefined') {
			setTimeout(() => this.dismiss(id), timeout);
		}
		return id;
	}

	success(message: string, action?: Toast['action']) {
		return this.push(message, { tone: 'success', action });
	}

	dismiss(id: number) {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

export const toasts = new ToastStore();
