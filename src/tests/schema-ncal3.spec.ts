import { describe, it, expect } from 'vitest';
import { crmMeetings, crmLeads } from '$lib/server/db/schema';

describe('NCAL-3 schema columns', () => {
	it('crmMeetings has nextcloudUid column', () => {
		expect(crmMeetings.nextcloudUid.name).toBe('nextcloud_uid');
	});
	it('crmLeads has nextcloudGoLiveUid column', () => {
		expect(crmLeads.nextcloudGoLiveUid.name).toBe('nextcloud_go_live_uid');
	});
	it('crmLeads has nextcloudEventUid column', () => {
		expect(crmLeads.nextcloudEventUid.name).toBe('nextcloud_event_uid');
	});
});
