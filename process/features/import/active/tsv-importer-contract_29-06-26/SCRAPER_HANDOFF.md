# Scraper → Veent CRM: Data Handoff Spec

This document tells you what to build on the scraper side so the Veent CRM can import your data. Two paths are described: a one-time historical export (TSV file), and an ongoing live push (HTTP endpoint).

---

## Path A — One-time historical export (TSV)

Run a SQL export of your full dataset and hand over the file. The CRM will run its import script against it locally.

### Output format

| Property | Value |
|---|---|
| Encoding | UTF-8, **no BOM** |
| Delimiter | tab (`\t`) |
| Quoting | RFC-4180 — wrap any field containing a tab, newline, or `"` in double-quotes; escape inner `"` as `""` |
| First row | Header row with exact column names listed below |
| Nulls | All NULL → empty string |
| Filename | `veent-leads-export-YYYY-MM-DD.tsv` |

### Columns (34, in this order)

| # | Column name | Source table / field | Notes |
|---|---|---|---|
| 1 | `__row_type` | hardcoded | Always `veent_event_v1` |
| 2 | `export_version` | hardcoded | Always `1.0` |
| 3 | `event_id` | `events_event.id` | Cast to text |
| 4 | `event_name` | `events_event.name` | |
| 5 | `event_slug` | `events_event.slug` | |
| 6 | `event_category_raw` | `events_event.category` | Raw scraped string |
| 7 | `event_category_clean` | `events_event.agent_categories` | JSONB array → pipe-join (`Concert\|Live Band`) |
| 8 | `event_starts_at` | `events_event.starts_at` | ISO 8601 (`2026-03-15T18:00:00+08:00`) |
| 9 | `event_ends_at` | `events_event.ends_at` | ISO 8601, empty if unknown |
| 10 | `event_post_date` | `events_event.post_date` | ISO 8601, empty if unknown |
| 11 | `event_price` | `events_event.price` | Free text, empty if unknown |
| 12 | `event_source` | `events_event.source` | e.g. `eventbrite`, `facebook` |
| 13 | `event_source_url` | `events_event.source_url` | Full URL to the event listing |
| 14 | `event_registration_url` | `events_event.registration_url` | Empty if none |
| 15 | `event_image_url` | `events_event.image_url` | Empty if none |
| 16 | `event_raw_text` | `events_event.raw_text` | May contain tabs/newlines — must be quoted per RFC-4180 |
| 17 | `organizer_ref_id` | `events_event.organizer_ref_id` | Cast to text |
| 18 | `organizer_name` | `events_organizer.name` | **Required** — used as the CRM lead name |
| 19 | `organizer_slug` | `events_organizer.slug` | |
| 20 | `organizer_status` | `events_organizer.status` | |
| 21 | `organizer_facebook_url` | `events_organizer.facebook_url` | Full URL, empty if none |
| 22 | `organizer_instagram_url` | `events_organizer.instagram_url` | Full URL, empty if none |
| 23 | `organizer_website` | `events_organizer.website` | Full URL, empty if none |
| 24 | `organizer_email` | `events_organizer.email` | Lowercase, empty if none |
| 25 | `organizer_phone` | `events_organizer.phone` | Empty if none |
| 26 | `organizer_source` | `events_organizer.source` | |
| 27 | `organizer_enrichment_source` | `events_organizer.enrichment_source` | Empty if none |
| 28 | `organizer_scraped_at` | `events_organizer.scraped_at` or `.created_at` | ISO 8601 |
| 29 | `venue_name` | `events_venue.name` | Empty if no venue |
| 30 | `venue_address` | `events_venue.address` | |
| 31 | `venue_city` | `events_venue.city` | |
| 32 | `venue_country` | `events_venue.country` | |
| 33 | `venue_latitude` | `events_venue.latitude` | Decimal, empty if unknown |
| 34 | `venue_longitude` | `events_venue.longitude` | Decimal, empty if unknown |

### Reference SQL

```sql
SELECT
  'veent_event_v1'           AS __row_type,
  '1.0'                      AS export_version,
  e.id::text                 AS event_id,
  COALESCE(e.name, '')       AS event_name,
  COALESCE(e.slug, '')       AS event_slug,
  COALESCE(e.category, '')   AS event_category_raw,
  COALESCE(array_to_string(
    ARRAY(SELECT jsonb_array_elements_text(e.agent_categories)), '|'
  ), '')                     AS event_category_clean,
  COALESCE(e.starts_at::text, '')          AS event_starts_at,
  COALESCE(e.ends_at::text, '')            AS event_ends_at,
  COALESCE(e.post_date::text, '')          AS event_post_date,
  COALESCE(e.price, '')                    AS event_price,
  COALESCE(e.source, '')                   AS event_source,
  COALESCE(e.source_url, '')               AS event_source_url,
  COALESCE(e.registration_url, '')         AS event_registration_url,
  COALESCE(e.image_url, '')                AS event_image_url,
  COALESCE(e.raw_text, '')                 AS event_raw_text,
  COALESCE(e.organizer_ref_id, '')         AS organizer_ref_id,
  COALESCE(o.name, '')                     AS organizer_name,
  COALESCE(o.slug, '')                     AS organizer_slug,
  COALESCE(o.status, '')                   AS organizer_status,
  COALESCE(o.facebook_url, '')             AS organizer_facebook_url,
  COALESCE(o.instagram_url, '')            AS organizer_instagram_url,
  COALESCE(o.website, '')                  AS organizer_website,
  COALESCE(o.email, '')                    AS organizer_email,
  COALESCE(o.phone, '')                    AS organizer_phone,
  COALESCE(o.source, '')                   AS organizer_source,
  COALESCE(o.enrichment_source, '')        AS organizer_enrichment_source,
  COALESCE(o.scraped_at::text, o.created_at::text, '') AS organizer_scraped_at,
  COALESCE(v.name, '')                     AS venue_name,
  COALESCE(v.address, '')                  AS venue_address,
  COALESCE(v.city, '')                     AS venue_city,
  COALESCE(v.country, '')                  AS venue_country,
  COALESCE(v.latitude::text, '')           AS venue_latitude,
  COALESCE(v.longitude::text, '')          AS venue_longitude
FROM events_event e
LEFT JOIN events_organizer o ON o.id = e.organizer_ref_id
LEFT JOIN events_venue v     ON v.id = e.venue_id
ORDER BY e.organizer_ref_id, e.starts_at;
```

> **Heads up:** field names in the SQL above match what we observed in the Neon DB. If any column name differs in your actual schema, adjust the SQL — the **output column aliases must stay exactly as listed**. The CRM validates the header row.

---

## Path B — Ongoing live push (HTTP)

Once an organizer or event is new, POST it to the CRM ingest endpoint. This is the steady-state sync path after the historical load is done.

### Endpoint

```
POST https://<crm-host>/api/leads/ingest
Authorization: Bearer <INGEST_SECRET>   ← ask the CRM team for this value
Content-Type: application/json
```

### Request body

```json
{
  "leads": [
    {
      "pageName": "Manila Book Fair",
      "handle": "manilabookfair",
      "url": "https://facebook.com/ManilaBkFair",
      "platform": "Facebook",
      "category": "Expo",
      "location": "Manila, Philippines",
      "eventName": "Manila Book Fair 2026",
      "sourceRef": "eventbrite-123456"
    }
  ]
}
```

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `pageName` | string | yes | Organizer display name |
| `handle` | string | yes | Unique identifier — lowercase, alphanumeric + hyphens only. Extract from the social URL path segment (e.g. `facebook.com/ManilaBkFair` → `manilabkfair`). This is the dedup key: if this handle already exists in the CRM, the lead is skipped. |
| `url` | string | yes | Primary page URL (Facebook, Instagram, or website) |
| `platform` | `"Facebook"` \| `"Instagram"` \| `"Website"` | yes | |
| `category` | string | yes | Use one of the CRM categories listed below |
| `location` | string | no | Free text, e.g. `"Manila, Philippines"` |
| `eventName` | string | no | Most recent or upcoming event headline |
| `sourceRef` | string | no | Your internal ID or URL for traceability |

### Accepted category values

```
Sports | Concert | Live Band | Music Fest | Workshop | Theater |
Conference | Convention | Expo | Competition | Church | Fan Fair |
School | Film | Screening | Bar/DJ | Other
```

If the category doesn't match any of these, send `"Other"` — the CRM will flag it for manual review.

### Response

```json
{ "received": 5, "created": 3, "skipped": 2, "review": 1 }
```

- `received` — leads in the request
- `created` — newly inserted
- `skipped` — handle already existed, no change made
- `review` — created but flagged for a rep to verify (unmapped category or no social URL)

### Dedup behaviour

The handle is the dedup key on both paths. Sending the same handle twice → second call is a no-op. Sending a new event for an existing organizer doesn't update the organizer record — it's safe to re-send known organizers in every batch.

---

## Questions?

Contact Hans on the CRM side. The relevant files for reference:
- Import script: `scripts/import.ts`
- Ingest endpoint: `src/routes/api/leads/ingest/+server.ts`
- TSV Zod schema (all 34 field names): `src/lib/zod/schemas.ts` → `tsvRowSchema`
