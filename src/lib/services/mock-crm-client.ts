/**
 * In-memory mock implementation of {@link CrmClient}.
 *
 * Holds module-level state so prototype mutations (claim, move stage, log touch)
 * persist across client-side navigations — behaving like the future backend.
 * Every method is async to match the real API contract.
 *
 * TODO(api): replace each method body with a real fetch() to the backend.
 */
import {
	CURRENT_USER_ID,
	mockActivities,
	mockLeads,
	mockReport,
	mockReviewItems,
	mockUsers
} from '$lib/data/mock-data';
import type {
	Activity,
	AddActivityInput,
	CreateLeadInput,
	CreateUserInput,
	Lead,
	LeadFilters,
	LostReason,
	MoveStagePayload,
	ReportData,
	ReviewItem,
	Stage,
	UpdateLeadInput,
	UpdateUserInput,
	User
} from '$lib/types';
import type { CrmClient } from './crm-client';
import { addDays, computeAge } from '$lib/utils/dates';
import { leadsToCsv } from '$lib/utils/csv';

// Working copies so we never mutate the seed arrays.
const leads: Lead[] = mockLeads.map((l) => ({ ...l }));
const users: User[] = mockUsers.map((u) => ({ ...u }));
const activities: Record<string, Activity[]> = structuredClone(mockActivities);
const reviewItems: ReviewItem[] = mockReviewItems.map((r) => ({ ...r }));

let currentUserId = CURRENT_USER_ID;
let idSeq = 1000;
const nextId = (prefix: string) => `${prefix}_${++idSeq}`;

const clone = <T>(v: T): T => structuredClone(v);
const delay = <T>(value: T): Promise<T> => Promise.resolve(clone(value));

function refreshAge(lead: Lead): void {
	lead.age = computeAge(lead);
}

class MockCrmClient implements CrmClient {
	setCurrentUser(userOrId: string | User): void {
		if (typeof userOrId === 'string') {
			if (users.some((u) => u.id === userOrId)) currentUserId = userOrId;
		} else {
			const uIndex = users.findIndex((u) => u.id === userOrId.id || u.email === userOrId.email);
			if (uIndex >= 0) {
				users[uIndex] = { ...users[uIndex], ...userOrId };
				currentUserId = users[uIndex].id;
			} else {
				users.push({ ...userOrId });
				currentUserId = userOrId.id;
			}
		}
	}

	async getCurrentUser(): Promise<User> {
		return delay(users.find((u) => u.id === currentUserId) ?? users[0]);
	}

	async listLeads(filters: LeadFilters = {}): Promise<Lead[]> {
		let out = leads.slice();
		const me = currentUserId;

		switch (filters.segment) {
			case 'mine':
				out = out.filter((l) => l.ownerId === me);
				break;
			case 'unassigned':
				out = out.filter((l) => l.ownerId === null);
				break;
			case 'lost':
				out = out.filter((l) => l.stage === 'lost');
				break;
			// 'all' / undefined → no owner filter
		}

		if (filters.ownerId !== undefined) out = out.filter((l) => l.ownerId === filters.ownerId);
		if (filters.stage) out = out.filter((l) => l.stage === filters.stage);
		if (filters.platform) out = out.filter((l) => l.platform === filters.platform);
		if (filters.category) out = out.filter((l) => l.category === filters.category);
		if (filters.staleOnly) out = out.filter((l) => l.age.type === 'stale');
		if (filters.search) {
			const q = filters.search.toLowerCase();
			out = out.filter(
				(l) => l.name.toLowerCase().includes(q) || l.handle.toLowerCase().includes(q)
			);
		}

		// Lost leads are hidden by default unless explicitly requested.
		if (filters.segment !== 'lost' && !filters.includeLost) {
			out = out.filter((l) => l.stage !== 'lost');
		}

		// Freshest first.
		out.sort((a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt));
		return delay(out);
	}

	async getLead(id: string): Promise<Lead | null> {
		return delay(leads.find((l) => l.id === id) ?? null);
	}

	async createLead(input: CreateLeadInput): Promise<Lead> {
		const lead: Lead = {
			id: nextId('lead'),
			name: input.name,
			handle: input.name.startsWith('@')
				? input.name
				: '@' + input.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
			category: input.category,
			location: input.location ?? '—',
			country: '—',
			platform: input.platform ?? 'Other',
			stage: 'new',
			ownerId: currentUserId,
			eventName: input.eventName,
			eventDate: input.eventDate,
			email: input.email,
			pageUrl: input.pageUrl,
			source: input.source ?? 'manual',
			notes: input.notes,
			hasFutureEvents: false,
			createdAt: new Date().toISOString(),
			lastActivityAt: new Date().toISOString(),
			age: { label: 'new', type: 'normal' },
			urgency: 'normal'
		};
		leads.unshift(lead);
		return delay(lead);
	}

	async updateLead(id: string, input: UpdateLeadInput): Promise<Lead> {
		const lead = leads.find((l) => l.id === id);
		if (!lead) throw new Error(`Lead ${id} not found`);
		Object.assign(lead, input);
		refreshAge(lead);
		return delay(lead);
	}

	async moveLeadStage(id: string, stage: Stage, payload: MoveStagePayload = {}): Promise<Lead> {
		const lead = leads.find((l) => l.id === id);
		if (!lead) throw new Error(`Lead ${id} not found`);
		lead.stage = stage;
		if (stage === 'won') {
			lead.signedOrg = payload.wonOrgName;
			lead.dealValue =
				payload.dealValueCents !== undefined ? payload.dealValueCents / 100 : undefined;
			lead.currency = payload.currency ?? 'PHP';
			lead.signedDate = payload.signedAt ?? new Date().toISOString();
		}
		if (stage === 'lost') {
			lead.lostReason = payload.lostReason;
		}
		lead.lastActivityAt = new Date().toISOString();
		refreshAge(lead);
		return delay(lead);
	}

	async claimLead(id: string): Promise<Lead> {
		const lead = leads.find((l) => l.id === id);
		if (!lead) throw new Error(`Lead ${id} not found`);
		lead.ownerId = currentUserId;
		return delay(lead);
	}

	async bulkClaim(ids: string[]): Promise<Lead[]> {
		const out: Lead[] = [];
		for (const id of ids) {
			const lead = leads.find((l) => l.id === id);
			if (lead) {
				lead.ownerId = currentUserId;
				out.push(lead);
			}
		}
		return delay(out);
	}

	async reassignLeads(ids: string[], ownerId: string | null): Promise<Lead[]> {
		const out: Lead[] = [];
		for (const id of ids) {
			const lead = leads.find((l) => l.id === id);
			if (lead) {
				if (ownerId === null) lead.formerOwnerId = lead.ownerId;
				lead.ownerId = ownerId;
				out.push(lead);
			}
		}
		return delay(out);
	}

	async markLost(ids: string[], reason: LostReason): Promise<Lead[]> {
		const out: Lead[] = [];
		for (const id of ids) {
			const lead = leads.find((l) => l.id === id);
			if (lead) {
				lead.stage = 'lost';
				lead.lostReason = reason;
				refreshAge(lead);
				out.push(lead);
			}
		}
		return delay(out);
	}

	async listActivities(leadId: string): Promise<Activity[]> {
		const list =
			activities[leadId] ??
			(activities[leadId] = (() => {
				const lead = leads.find((l) => l.id === leadId);
				return [
					{
						id: nextId('act'),
						leadId,
						repId: lead?.ownerId ?? currentUserId,
						channel: 'fb_dm',
						outcome: 'sent',
						createdAt: lead?.createdAt ?? new Date().toISOString(),
						note: 'First outreach logged.'
					} satisfies Activity
				];
			})());
		// newest first
		return delay(list.slice().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)));
	}

	async addActivity(leadId: string, input: AddActivityInput): Promise<Activity> {
		const activity: Activity = {
			id: nextId('act'),
			leadId,
			repId: currentUserId,
			channel: input.channel,
			outcome: input.outcome,
			note: input.note,
			createdAt: new Date().toISOString(),
			followUpAt: input.followUpInDays
				? addDays(new Date().toISOString(), input.followUpInDays)
				: undefined
		};
		(activities[leadId] ??= []).push(activity);

		// Activities drive reminders through follow_up_at.
		const lead = leads.find((l) => l.id === leadId);
		if (lead) {
			lead.lastActivityAt = activity.createdAt;
			lead.followUpAt = activity.followUpAt;
			if (input.outcome === 'replied' && lead.stage === 'contacted') lead.stage = 'replied';
			refreshAge(lead);
		}
		return delay(activity);
	}

	async listUsers(): Promise<User[]> {
		return delay(
			users.map((u) => ({
				...u,
				leadCount: leads.filter((l) => l.ownerId === u.id).length
			}))
		);
	}

	async createUser(input: CreateUserInput): Promise<User> {
		const user: User = {
			id: nextId('user'),
			name: input.name,
			email: input.email,
			role: input.role,
			active: input.active ?? true,
			leadCount: 0
		};
		users.push(user);
		return delay(user);
	}

	async updateUser(id: string, input: UpdateUserInput): Promise<User> {
		const user = users.find((u) => u.id === id);
		if (!user) throw new Error(`User ${id} not found`);
		Object.assign(user, input);
		return delay(user);
	}

	async listReviewItems(): Promise<ReviewItem[]> {
		return delay(reviewItems);
	}

	async resolveReviewItem(
		id: string,
		fields?: { name?: string; category?: ReviewItem['category']; platform?: ReviewItem['platform'] }
	): Promise<void> {
		const i = reviewItems.findIndex((r) => r.id === id);
		if (i >= 0) {
			if (fields) Object.assign(reviewItems[i], fields);
			reviewItems.splice(i, 1);
		}
		return Promise.resolve();
	}

	async getReports(): Promise<ReportData> {
		return delay(mockReport);
	}

	async exportCsv(filters: LeadFilters = {}): Promise<string> {
		const rows = await this.listLeads({ ...filters, includeLost: true });
		return leadsToCsv(rows);
	}
}

export const mockCrmClient = new MockCrmClient();
