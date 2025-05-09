import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { attendeeProfiles } from "../schema/attendeeProfile.ts";
import { z } from "zod";

export const attendeeProfileSelectSchema = createSelectSchema(attendeeProfiles)
export const attendeeProfileInsertSchema = createInsertSchema(attendeeProfiles)
    .omit({
        attendeeProfileId: true
    })
    .strict()

export const attendeeProfileUpdateSchema = attendeeProfileInsertSchema.strict()

export type AttendeeProfileInsert = z.infer<typeof attendeeProfileInsertSchema>
export type AttendeeProfileUpdate = z.infer<typeof attendeeProfileUpdateSchema>
export type AttendeeProfileSelect = z.infer<typeof attendeeProfileSelectSchema>
    