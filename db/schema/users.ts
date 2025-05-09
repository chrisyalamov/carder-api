// deno-lint-ignore no-unused-vars
import { boolean, check, foreignKey, index, pgEnum, pgTable, text, unique, uniqueIndex } from "drizzle-orm/pg-core"
import { ulid } from "../ulid.ts";
import { not, sql } from "drizzle-orm";
import { events } from "./events.ts";

export const users = pgTable("users", {
	userId: text("id").primaryKey().notNull().$default(ulid),
	fullName: text("full_name").notNull(),
	email: text("email").notNull(),
	passwordHash: text("password_hash").notNull(),
	profileImageUrl: text("profile_image_url"),
	accountStatus: text("account_status").notNull().default("created"),
}, (table) => [
	check("CK_Users_AccountStatus", sql`${table.accountStatus} IN ('created', 'active', 'suspended', 'deleted')`),
	unique("UQ_Users_Email").on(table.email),
]);