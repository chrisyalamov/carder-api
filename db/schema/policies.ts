import { check, foreignKey, index, pgTable, text } from "drizzle-orm/pg-core"
import { ulid } from "../ulid.ts";
import { sql } from "drizzle-orm";
import { users } from "./users.ts";
import { roles } from "./roles.ts";

export const policies = pgTable("policies", {
    policyId: text("id").primaryKey().notNull().$default(ulid),
    principalDiscriminator: text("principal_discriminator").notNull(),
    userId: text("user_id"),
    roleId: text("role_id"),
    resourceDiscriminator: text("resource_discriminator").notNull(),
    resourceId: text("resource_id").notNull(),
    action: text("action").notNull(),
    effect: text("effect").notNull().default("deny"),
}, (table) => [
    // (Currently, the only query on this table does not use
    // the field, it's possible that it is redundant)

    /**
     * This creates a CHECK constraint that ensures the correct field is
     * populated based on the principalDiscriminator.
     * 
     * It checks that EITHER:
     * 
     * [1]  principalDiscriminator = 'User' 
     *      the UserID is present
     *      and the RoleID is not
     * 
     * [2]  principalDiscriminator = 'Role'
     *      the RoleID is present
     *      and the UserID is not
     * 
     * Why CHECK constraint instead of an enum?
     * 
     * Postgres supports enumerated types, however, they are defined
     * in system catalogues, meaning additional steps are required
     * to view or modify their definition.
     * 
     * See: https://stackoverflow.com/a/10984951
     */
    check("CK_AccessControlPolicies_SinglePrincipal", sql`
        (
            ${table.principalDiscriminator} = 'user' 
            AND ${table.userId} IS NOT NULL 
            AND ${table.roleId} IS NULL
        ) 
        OR 
        (
            ${table.principalDiscriminator} = 'role' 
            AND ${table.roleId} IS NOT NULL 
            AND ${table.userId} IS NULL
        )`
    ),
    index("IX_ACPs_ResourceDiscriminator_ResourceID_UserID").using("btree", table.resourceDiscriminator.asc().nullsLast().op("text_ops"), table.resourceId.asc().nullsLast().op("text_ops"), table.userId.asc().nullsLast().op("text_ops")),
    index("IX_ACPs_ResourceDiscriminator_ResourceID_RoleID").using("btree", table.resourceDiscriminator.asc().nullsLast().op("text_ops"), table.resourceId.asc().nullsLast().op("text_ops"), table.roleId.asc().nullsLast().op("text_ops")),
    check("CK_ACPs_Effect", sql`${table.effect} IN ('allow', 'deny')`),
    check("CK_ACPs_PrincipalDiscriminator", sql`${table.principalDiscriminator} IN ('user', 'role')`),
    foreignKey({
        columns: [table.userId],
        foreignColumns: [users.userId],
        name: "FK_Policies_Users_UserId"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.roleId],
        foreignColumns: [roles.roleId],
        name: "FK_Policies_Roles_RoleId"
    }).onDelete("cascade"),
]);