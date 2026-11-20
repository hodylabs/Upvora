-- Which look a site uses: 'classic' or 'new' (the new UI). Existing sites stay on classic;
-- sites created after this release start on 'new' (set at creation, see createTenant).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ui VARCHAR(20) NOT NULL DEFAULT 'classic';
