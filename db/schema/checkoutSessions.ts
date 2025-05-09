import { foreignKey, index, pgTable, text, unique } from "drizzle-orm/pg-core";
import { organisations } from "./organisations.ts";
import { ulid } from "../ulid.ts";
import { purchaseOrders } from "./purchaseOrders.ts";

export const checkoutSessions = pgTable("checkout_sessions", {
    checkoutSessionId: text("id").primaryKey().notNull().$default(ulid),
    organisationId: text("organisation_id").notNull(),
    purchaseOrderId: text("purchase_order_id").notNull(),
    status: text("status").notNull().default("pending"),
    stripeSessionId: text("stripe_session_id"),
}, table => [
    index("IX_CheckoutSessions_OrganisationId").using("btree", table.organisationId.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.organisationId],
        foreignColumns: [organisations.organisationId],
        name: "FK_CheckoutSessions_Organisations_OrganisationId"
    }).onDelete("cascade"),
    index("IX_CheckoutSessions_PurchaseOrderId").using("btree", table.purchaseOrderId.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.purchaseOrderId],
        foreignColumns: [purchaseOrders.purchaseOrderId],
        name: "FK_CheckoutSessions_PurchaseOrders_PurchaseOrderId"
    }).onDelete("cascade"),
    unique("UQ_CheckoutSessions_PurchaseOrderId")
]);