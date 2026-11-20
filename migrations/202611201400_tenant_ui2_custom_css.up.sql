-- The new look's own Custom CSS. The existing custom_css targets classic's markup and
-- keeps applying to classic only; this one applies to the new look only.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ui2_custom_css TEXT NOT NULL DEFAULT '';
