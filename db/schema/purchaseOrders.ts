import { foreignKey, index, pgTable, text } from "drizzle-orm/pg-core";
import { organisations } from "./organisations.ts";
import { ulid } from "../ulid.ts";

export const purchaseOrders = pgTable("purchase_orders", {
	purchaseOrderId: text("id").primaryKey().notNull().$default(ulid),
	organisationId: text("organisation_id").notNull(),
	status: text("status").notNull().default("pending"),
}, (table) => [
	index("IX_PurchaseOrders_OrganisationId").using("btree", table.organisationId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organisationId],
			foreignColumns: [organisations.organisationId],
			name: "FK_PurchaseOrders_Organisations_OrganisationId"
		}).onDelete("cascade"),
]);