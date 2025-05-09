import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { roleAssignments } from "../schema/roleAssignments.ts";
import { z } from "zod";

export const roleAssignmentSelectSchema = createSelectSchema(roleAssignments)
export const roleAssignmentInsertSchema = createInsertSchema(roleAssignments).strict()
    .omit({
        roleAssignmentId: true
    })
export const roleAssignmentUpdateSchema = roleAssignmentInsertSchema.strict()

export type RoleAssignmentInsert = z.infer<typeof roleAssignmentInsertSchema>
export type RoleAssignmentUpdate = z.infer<typeof roleAssignmentUpdateSchema>
export type RoleAssignmentSelect = z.infer<typeof roleAssignmentSelectSchema>