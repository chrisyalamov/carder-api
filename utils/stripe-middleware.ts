import { Env } from "../main.ts"
import { createMiddleware } from "npm:hono/factory"
import stripe from "npm:stripe"

const SECRET = Deno.env.get("STRIPE_SECRET") as string
export const s = new stripe(SECRET)

export const stripeMiddleware = createMiddleware<Env>(async (c, next) => {
  c.set("stripe", s)
  await next()
})
