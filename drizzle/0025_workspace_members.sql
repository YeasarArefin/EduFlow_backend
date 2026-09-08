INSERT INTO permissions (code, key, name, module, description)
VALUES (1601, 'members.manage', 'Manage workspace members', 'members', 'Add, update, suspend, and remove workspace members.')
ON CONFLICT (code) DO UPDATE SET
  key = EXCLUDED.key,
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  description = EXCLUDED.description;

INSERT INTO role_permissions (role_code, permission_code)
VALUES (101, 1601), (201, 1601)
ON CONFLICT DO NOTHING;
