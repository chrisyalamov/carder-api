import { Env } from "../main.ts";
import { createMiddleware } from "npm:hono/factory";
import db from "../db/db.ts";

export const dbMiddleware = createMiddleware<Env>(async (c, next) => {
    c.set('database', db)
    await next()
  })
