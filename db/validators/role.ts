import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { roles } from "../schema/roles.ts";
import { z } from "zod";

export const roleSelectSchema = createSelectSchema(roles)
export const roleInsertSchema = createInsertSchema(roles).strict()
    .omit({
        roleId: true
    })
export const roleUpdateSchema = roleInsertSchema.strict()

export type RoleInsert = z.infer<typeof roleInsertSchema>
export type RoleUpdate = z.infer<typeof roleUpdateSchema>
export type RoleSelect = z.infer<typeof roleSelectSchema>