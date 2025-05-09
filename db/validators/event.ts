import { createInsertSchema, createSelectSchema, createUpdateSchema } from "npm:drizzle-zod";
import { z } from "zod";
import { events } from "../schema/events.ts";

export const eventSelectSchema = createSelectSchema(events)
export const eventInsertSchema = createInsertSchema(events)
    .omit({
        eventId: true
    })
    .setKey("name", z.string().min(3))
    .setKey("description", z.string().min(10))
    .strict()

export const eventUpdateSchema = createUpdateSchema(events)

export type EventInsert = z.infer<typeof eventInsertSchema>
export type EventUpdate = z.infer<typeof eventUpdateSchema>
export type EventSelect = z.infer<typeof eventSelectSchema>