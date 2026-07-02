import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-svelte class merge helper. Imported by every `ui/` primitive. */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

export type WithElementRef<T, E extends HTMLElement = HTMLElement> = T & { ref?: E | null };
