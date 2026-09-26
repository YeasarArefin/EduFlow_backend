import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';
export const notificationDeliveryStatus = pgEnum('notification_delivery_status', [
  'sent',
  'failed',
  'skipped',
]);
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    eventId: text('event_id').notNull(),
    channel: varchar('channel', { length: 10 }).notNull(),
    recipient: text('recipient'),
    status: notificationDeliveryStatus('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notification_deliveries_event_channel_recipient_idx').on(
      t.workspaceId,
      t.eventType,
      t.eventId,
      t.channel,
      t.recipient
    ),
    index('notification_deliveries_workspace_event_idx').on(t.workspaceId, t.eventType, t.eventId),
  ]
);
