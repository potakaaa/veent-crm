/**
 * Backend-ready CRM client interface.
 *
 * Every screen depends on THIS interface, never on raw mock arrays. When the
 * backend lands, implement `CrmClient` against the real API and swap the
 * exported singleton in `$lib/services` — no route or component changes needed.
 */
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

export interface CrmClient {
	// Identity
	getCurrentUser(): Promise<User>;

	// Leads
	listLeads(filters?: LeadFilters): Promise<Lead[]>;
	getLead(id: string): Promise<Lead | null>;
	createLead(input: CreateLeadInput): Promise<Lead>;
	updateLead(id: string, input: UpdateLeadInput): Promise<Lead>;
	moveLeadStage(id: string, stage: Stage, payload?: MoveStagePayload): Promise<Lead>;

	// Ownership
	claimLead(id: string): Promise<Lead>;
	bulkClaim(ids: string[]): Promise<Lead[]>;
	reassignLeads(ids: string[], ownerId: string): Promise<Lead[]>;
	markLost(ids: string[], reason: LostReason): Promise<Lead[]>;

	// Activities
	listActivities(leadId: string): Promise<Activity[]>;
	addActivity(leadId: string, input: AddActivityInput): Promise<Activity>;

	// Team
	listUsers(): Promise<User[]>;
	createUser(input: CreateUserInput): Promise<User>;
	updateUser(id: string, input: UpdateUserInput): Promise<User>;

	// Review queue (sheet-import rows needing a human)
	listReviewItems(): Promise<ReviewItem[]>;
	resolveReviewItem(id: string): Promise<void>;

	// Reports
	getReports(filters?: { from?: string; to?: string }): Promise<ReportData>;
	exportCsv(filters?: LeadFilters): Promise<string>;
}
