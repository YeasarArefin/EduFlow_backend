INSERT INTO permissions (code, key, name, module, description) VALUES
  (1701, 'expenses.view', 'View expenses and finance', 'expenses', 'View workspace expenses and financial summaries.'),
  (1702, 'expenses.manage', 'Manage expenses', 'expenses', 'Create, edit, and manage workspace expenses.'),
  (1703, 'expenses.reverse', 'Reverse expenses', 'expenses', 'Reverse recorded workspace expenses.')
ON CONFLICT (code) DO UPDATE SET
  key = EXCLUDED.key,
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  description = EXCLUDED.description;
--> statement-breakpoint
INSERT INTO role_permissions (role_code, permission_code)
VALUES (101, 1701), (101, 1702), (101, 1703)
ON CONFLICT DO NOTHING;
