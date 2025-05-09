import { pgTable, index, foreignKey, text, check } from "drizzle-orm/pg-core"
import { organisations } from "./organisations.ts";
import { ulid } from "../ulid.ts";
import { purchaseOrders } from "./purchaseOrders.ts";
import { sql } from "drizzle-orm";
import { skus } from "./skus.ts";

export const licenses = pgTable("licenses", {
	licenseId: text("id").primaryKey().notNull().$default(ulid),
	licenseType: text("type").notNull(),
	organisationId: text("organisation_id").notNull(),
	purchaseOrderId: text("purchase_order_id"),
	status: text("status").notNull().default("available"),
	skuId: text("sku_id").notNull(),
}, (table) => [
	index("IX_Licenses_OrganisationId").using("btree", table.organisationId.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.organisationId],
		foreignColumns: [organisations.organisationId],
		name: "FK_Licenses_Organisations_OrganisationId"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.purchaseOrderId],
		foreignColumns: [purchaseOrders.purchaseOrderId],
		name: "FK_Licenses_PurchaseOrders_PurchaseOrderId"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.skuId],
		foreignColumns: [skus.skuId],
		name: "FK_Licenses_Skus_SkuId"
	}),
	check("CK_Licenses_Status", sql`${table.status} IN ('available', 'assigned', 'consumed', 'expired')`),
]);
