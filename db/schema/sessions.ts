import { json, pgTable, text } from "drizzle-orm/pg-core";
import { ulid } from "../ulid.ts";

export const sessions = pgTable("sessions", {
	sessionId: text("id").primaryKey().notNull().$default(ulid),
	data: json("data").notNull(),
});