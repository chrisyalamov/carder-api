import { createMiddleware } from "npm:hono/factory"
import { Env } from "../main.ts"
import { z } from "zod"
import { getCookie, setCookie } from "npm:hono/cookie"
import { sessions } from "../db/schema/sessions.ts";
import { eq } from "drizzle-orm/expressions";

const cartValidator = z.object({
  cartLineItems: z.array(
    z.object({
      skuId: z.string(),
      quantity: z.number().min(1),
    })
  ),
})

const sessionValidator = z.object({
  user: z
    .object({
      userId: z.string(),
      accountStatus: z.string().optional(),
      fullName: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  /**
   * CSRF attack prevention tokens
   */
  continuity: z.record(z.string(), z.any()),
  /**
   * One-time passcodes
   */
  otps: z.record(z.string(), z.string().length(6)),
  /**
   * Cart
   */
  cart: cartValidator.optional(),
  clear: z.boolean().optional(),
})

export type Session = z.infer<typeof sessionValidator>
export const blankSession: Session = {
  user: undefined,
  continuity: {},
  otps: {},
  cart: {
    cartLineItems: [],
  },
}

export const sessionMiddleware = createMiddleware<Env>(async (c, next) => {
  // Blank session object
  let session: Session = JSON.parse(JSON.stringify(blankSession))
  const { database: db } = c.var

  // Retrieve the session cookie from the request
  let sessionId = getCookie(c, "session")

  // Fill in the session object with the contents of the cookie
  const sessionObject = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId || ""))

  const sessionFound = sessionObject.length > 0

  if (sessionId && sessionFound) {
    if (sessionObject[0].data instanceof String) {
      // If the session data is a string, parse it
      session = JSON.parse(sessionObject[0].data as string) as any
    } else {
      // If the session data is an object, use it directly
      session = sessionObject[0].data as any
    }
  } else {
    // If no session cookie is present, or session ID not found,
    // we create a new session object

    // Store the session object in the session store
    const insertedSession = await db.insert(sessions).values({
      data: JSON.stringify(session),
    }).returning({
      sessionId: sessions.sessionId,
    })

    sessionId = insertedSession[0].sessionId

    setCookie(c, "session", sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    })
  }

  // Provide the session object to the request context
  c.set("session", session)

  // Let the request be processed
  await next()

  /**
   * All other middleware and routes have now been processed.
   *
   * Here, we remove any UICs that are older than 5 minutes,
   * and then seal the session object and set it as a cookie
   */

  if (session?.clear) {
    // Delete cookie
    setCookie(c, "session", "", {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 0,
    })

    // Clear the session store
    await db.delete(sessions).where(eq(sessions.sessionId, sessionId))

    return
  }

  // Remove UICs that are older than 5 minutes
  const earliestIssuedAt = Date.now() - 5 * 60 * 1000

  Object.keys(session.continuity).forEach((key) => {
    const uic = session.continuity[key]
    if (uic.issuedAt < earliestIssuedAt) {
      delete session.continuity[key]
    }
  })

  // Store new session object in the session store
  await db.update(sessions).set({
    data: JSON.stringify(session),
  }).where(eq(sessions.sessionId, sessionId))

  return
})
