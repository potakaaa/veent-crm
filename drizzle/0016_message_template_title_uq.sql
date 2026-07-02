CREATE UNIQUE INDEX IF NOT EXISTS "crm_message_templates_title_active_uq" ON "crm_message_templates" ("title") WHERE deleted_at is null;
