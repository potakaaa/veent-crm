import { toast } from 'svelte-sonner';

export const toasts = {
	push(
		message: string,
		opts: {
			tone?: 'default' | 'success' | 'warn';
			action?: { label: string; run: () => void };
			timeout?: number;
		} = {}
	) {
		const options = {
			id: message,
			duration: opts.timeout ?? 4000,
			...(opts.action ? { action: { label: opts.action.label, onClick: opts.action.run } } : {})
		};
		if (opts.tone === 'success') {
			toast.success(message, options);
		} else if (opts.tone === 'warn') {
			toast.warning(message, options);
		} else {
			toast(message, options);
		}
	},

	success(message: string, action?: { label: string; run: () => void }) {
		this.push(message, { tone: 'success', action });
	},

	dismiss(id: string | number) {
		toast.dismiss(id);
	}
};
