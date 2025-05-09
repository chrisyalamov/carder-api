import { pgTable, text, unique } from "drizzle-orm/pg-core"
import { ulid } from "../ulid.ts";

export const organisations = pgTable("organisations", {
	organisationId: text("id").primaryKey().notNull().$default(ulid),
	key: text("key").notNull(),
	name: text("name").notNull(),
}, table => [
	unique("AK_OrganisaionKey").on(table.key),
]);