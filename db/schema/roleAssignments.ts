import { foreignKey, index, pgTable, text } from "drizzle-orm/pg-core"
import { ulid } from "../ulid.ts";
import { users } from "./users.ts";
import { roles } from "./roles.ts";

export const roleAssignments = pgTable("role_assignments", {
	roleAssignmentId: text("id").primaryKey().notNull().$default(ulid),
	userId: text("user_id").notNull(),
    roleId: text("role_id").notNull(),
}, table => [
    index("IX_RoleAssignments_UserId").using("btree", table.userId.asc().nullsLast().op("text_ops")),
    index("IX_RoleAssignments_RoleId").using("btree", table.roleId.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.userId],
        foreignColumns: [users.userId],
        name: "FK_RoleAssignments_Users_UserId"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.roleId],
        foreignColumns: [roles.roleId],
        name: "FK_RoleAssignments_Roles_RoleId"
    }).onDelete("cascade"),
]);