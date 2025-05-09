import { Env } from "../main.ts"
import { createMiddleware } from "npm:hono/factory"
import stripe from "npm:stripe"

export const stripeMiddleware = createMiddleware<Env>(async (c, next) => {
  const secret = Deno.env.get("STRIPE_SECRET") as string
  const s = new stripe(secret)

  c.set("stripe", s)
  await next()
})
