// Reminders — STUB for v0. See sales-crm.md §Reminders.
// follow_up_at drives the in-app "Today" due view; due/overdue computed in Asia/Manila.
// An n8n workflow calls the secret-authed /api/reminders/due endpoint (n8n holds no DATABASE_URL).

export const REMINDER_TZ = 'Asia/Manila';

export type DueReminder = {
	leadId: string;
	leadName: string;
	repEmail: string | null;
	followUpAt: string; // ISO
	overdue: boolean;
};

// TODO: query crm_activities WHERE follow_up_at <= now() (Asia/Manila day boundary),
// join leads + owner, group by rep.
export async function getDueReminders(): Promise<DueReminder[]> {
	return []; // STUB
}
