import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const content = sqliteTable('content', {
 id: text('id').primaryKey(), kind:text('kind').notNull(), title:text('title').notNull(), body:text('body').notNull(), status:text('status').notNull().default('draft'),
 data:text('data').notNull().default('{}'), images:text('images').notNull().default('[]'), eventStart:text('event_start'), reportDate:text('report_date'), amountCents:integer('amount_cents'),
 createdBy:text('created_by').notNull(), createdAt:text('created_at').notNull(), updatedAt:text('updated_at').notNull(), version:integer('version').notNull().default(1), deleted:integer('deleted').notNull().default(0), mutation:text('mutation').notNull()
}, t=>[index('idx_content_kind_status_deleted').on(t.kind,t.status,t.deleted), uniqueIndex('idx_collection_sunday').on(t.reportDate).where(sql`${t.kind} = 'collection' AND ${t.deleted} = 0`)]);
export const media = sqliteTable('media', {id:text('id').primaryKey(),objectKey:text('object_key').notNull(),filename:text('filename').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),alt:text('alt').notNull(),createdAt:text('created_at').notNull(),createdBy:text('created_by').notNull()});
export const settings = sqliteTable('settings', {id:text('id').primaryKey(),data:text('data').notNull(),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull(),mutation:text('mutation').notNull()});
export const audit = sqliteTable('audit', {id:text('id').primaryKey(),entityId:text('entity_id').notNull(),action:text('action').notNull(),actor:text('actor').notNull(),before:text('before_json'),after:text('after_json'),createdAt:text('created_at').notNull()},t=>[index('idx_audit_created_at').on(t.createdAt)]);
export const adminIdentity = sqliteTable('admin_identity',{id:text('id').primaryKey(),userId:text('user_id').notNull(),createdAt:text('created_at').notNull()});
export const accounts = sqliteTable('accounts',{id:text('id').primaryKey(),email:text('email').notNull(),passwordHash:text('password_hash').notNull(),createdAt:text('created_at').notNull()},t=>[uniqueIndex('idx_accounts_email').on(t.email)]);
export const sessions = sqliteTable('sessions',{tokenHash:text('token_hash').primaryKey(),accountId:text('account_id').notNull().references(()=>accounts.id),expiresAt:integer('expires_at').notNull()},t=>[index('idx_sessions_expires').on(t.expiresAt)]);
export const loginAttempts = sqliteTable('login_attempts',{key:text('key').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()});
