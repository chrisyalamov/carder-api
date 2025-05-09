import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { users } from "../schema/users.ts";
import { z } from "zod";
import { ZodObject } from "zod";
import { ZodRawShape } from "zod";

// Higher-order utility function to further refine/specify
// a given schema.

const specify = <T extends ZodRawShape>(schema: ZodObject<T>) => schema
    .setKey(
        "fullName",
        z.string().min(3)
    )
    .setKey(
        "email",
        z.string().email()
    )


export const userSelectSchema =
    specify(createSelectSchema(users))

export const _userUnrestrictedInsertSchema =
    specify(createInsertSchema(users))

export const _userUnrestrictedUpdateSchema = _userUnrestrictedInsertSchema

export const userInsertSchema =
    _userUnrestrictedInsertSchema
        .omit({
            userId: true,
            passwordHash: true,
            accountStatus: true
        })
        .strict()

export const userUpdateSchema = userInsertSchema

export type UserInsert = z.infer<typeof userInsertSchema>
export type UserUpdate = z.infer<typeof userUpdateSchema>
export type UserSelect = z.infer<typeof userSelectSchema>
export type UserUnrestrictedInsert = z.infer<typeof _userUnrestrictedInsertSchema>
export type UserUnrestrictedUpdate = z.infer<typeof _userUnrestrictedUpdateSchema>
export type UserStatus = z.infer<typeof userStatusSchema>