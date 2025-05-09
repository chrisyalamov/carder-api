import { foreignKey, pgTable, text } from "drizzle-orm/pg-core"
import { ulid } from "../ulid.ts";
import { organisations } from "./organisations.ts";

export const roles = pgTable("roles", {
	roleId: text("id").primaryKey().notNull().$default(ulid),
	organisationId: text("organisation_id").notNull(),
	// Human-readable name of the role
	name: text("name")
}, table => [
	foreignKey({
		columns: [table.organisationId],
		foreignColumns: [organisations.organisationId],
		name: "FK_Roles_Organisations_OrganisationId",
	}).onDelete("cascade"),
]);