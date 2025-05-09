import { pgTable, index, foreignKey, text, integer } from "drizzle-orm/pg-core"
import { licenses } from "./licenses.ts";
import { ulid } from "../ulid.ts";

export const licenseAssignments = pgTable("license_assignments", {
	licenseAssignmentId: text("id").primaryKey().notNull().$default(ulid),
	licenseId: text("license_id").notNull(),
	targetType: text("target_discriminator").notNull(),
	targetId: text("target_id").notNull(),
}, (table) => [
	index("IX_LicenseAssignments_LicenseId").using("btree", table.licenseId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.licenseId],
			foreignColumns: [licenses.licenseId],
			name: "FK_LicenseAssignments_Licenses_LicenseId"
		}).onDelete("cascade"),
]);