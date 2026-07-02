/**
 * Minimal headless sort-table helper for Svelte 5.
 *
 * Provides the same header API surface as TanStack Table (getHeaderGroups,
 * getCanSort, getIsSorted, getToggleSortingHandler) but is a plain JS object
 * whose functions close over reactive signals — no framework glue needed.
 *
 * Usage inside $derived:
 *   const table = $derived(makeSortTable({ data, columns, sort, dir, onToggle }));
 */

export type SortColDef = {
	id: string;
	header: string;
	enableSorting?: boolean;
	/** First click goes desc instead of asc (e.g. "last activity"). */
	sortDescFirst?: boolean;
};

export type SortHeader = {
	id: string;
	column: {
		columnDef: { header: string };
		getCanSort: () => boolean;
		getIsSorted: () => false | 'asc' | 'desc';
		getToggleSortingHandler: () => () => void;
	};
};

export function makeSortTable<T>(opts: {
	data: T[];
	columns: SortColDef[];
	sort: string;
	dir: 'asc' | 'desc';
	onToggle: (id: string, desc: boolean) => void;
}) {
	const { data, columns, sort, dir, onToggle } = opts;

	const headers: SortHeader[] = columns.map((col) => ({
		id: col.id,
		column: {
			columnDef: { header: col.header },
			getCanSort: () => col.enableSorting !== false,
			getIsSorted: (): false | 'asc' | 'desc' => {
				if (col.enableSorting === false || sort !== col.id) return false;
				return dir === 'asc' ? 'asc' : 'desc';
			},
			getToggleSortingHandler: () => () => {
				if (sort !== col.id) {
					// First click on this column
					onToggle(col.id, col.sortDescFirst ?? false);
				} else if (dir === 'asc') {
					onToggle(col.id, true); // asc → desc
				} else {
					onToggle(col.id, false); // desc → asc
				}
			}
		}
	}));

	return {
		getHeaderGroups: () => [{ headers }],
		getRowModel: () => ({
			rows: data.map((original, i) => ({ id: String(i), original }))
		})
	};
}
