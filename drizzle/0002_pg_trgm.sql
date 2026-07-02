CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_leads_name_trgm    ON crm_leads USING gin (name              gin_trgm_ops);
CREATE INDEX idx_leads_handle_trgm  ON crm_leads USING gin (normalized_handle gin_trgm_ops);
CREATE INDEX idx_leads_fb_trgm      ON crm_leads USING gin (social_facebook   gin_trgm_ops);
CREATE INDEX idx_leads_ig_trgm      ON crm_leads USING gin (social_instagram  gin_trgm_ops);
CREATE INDEX idx_leads_tiktok_trgm  ON crm_leads USING gin (social_tiktok     gin_trgm_ops);
CREATE INDEX idx_leads_twitter_trgm ON crm_leads USING gin (social_twitter    gin_trgm_ops);
