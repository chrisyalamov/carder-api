import { check, foreignKey, index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organisations } from "./organisations.ts";
import { ulid } from "../ulid.ts";
import { sql } from "drizzle-orm";

export const events = pgTable("events", {
	eventId: text("id").primaryKey().notNull().$default(ulid),
	name: text("name").notNull(),
	description: text("description").notNull(),
	location: text("location").notNull(),
	startDate: timestamp("start_date").notNull(),
	endDate: timestamp("end_date").notNull(),
	imageUrl: text("image_url"),
	organisationId: text("organisation_id").notNull(),
	eventStatus: text("status").notNull().default("planned"),
}, (table) => [
	index("IX_Events_OrganisationId").using("btree", table.organisationId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organisationId],
			foreignColumns: [organisations.organisationId],
			name: "FK_Events_Organisations_OrganisationId"
		}).onDelete("cascade"),
	check("CK_Events_Status", sql`${table.eventStatus} IN ('planned', 'upcoming', 'live', 'completed', 'cancelled')`),
]);