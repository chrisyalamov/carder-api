import { pgTable, index, foreignKey, text, unique } from "drizzle-orm/pg-core"
import { events } from "./events.ts";
import { ulid } from "../ulid.ts";
import { users } from "./users.ts";

export const attendeeProfiles = pgTable("attendee_profiles", {
	attendeeProfileId: text("id").primaryKey().notNull().$default(ulid),
	fullName: text("full_name").notNull(),
	eventId: text("event_id").notNull(),
	email: text("email").notNull(),
	userId: text("UserID"),
}, (table) => [
	index("IX_AttendeeProfiles_EventId").using("btree", table.eventId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.eventId],
			foreignColumns: [events.eventId],
			name: "FK_AttendeeProfiles_Events_EventId"
		}).onDelete("cascade"),
	/**
	 * (Alternative Key, Composite Unique Index)
	 * This constraint ensures that there can only be a single record
	 * with a specific email address for a specific event.
	 * 
	 * This ensures an attendee can only be enrolled in an event once.
     * 
	 */
	unique("AK_AttendeeEnrolments_EventId_Email").on(table.eventId, table.email),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.userId],
			name: "FK_AttendeeProfiles_Users_UserID"
		}).onDelete("cascade"),
]);