import { createMiddleware } from "npm:hono/factory"
import { Env } from "../main.ts"
import { z } from "zod"
import { getCookie, setCookie } from "npm:hono/cookie"
import { clear } from "node:console";

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

const sessionStore = new Map<string, Session>()

export const sessionMiddleware = createMiddleware<Env>(async (c, next) => {
  // Blank session object
  let session: Session = JSON.parse(JSON.stringify(blankSession))

  // Retrieve the session cookie from the request
  let sessionId = getCookie(c, "session")

  // Fill in the session object with the contents of the cookie

  if (sessionId && sessionStore.has(sessionId)) {
    session = sessionStore.get(sessionId) as any
  } else {
    // If no session cookie is present, or session ID not found,
    // we create a new session object

    // Generate a new session ID
    const newSessionId = crypto.randomUUID()

    // Store the session object in the session store
    sessionStore.set(newSessionId, session)
    sessionId = newSessionId

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
    sessionStore.delete(sessionId)

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
  sessionStore.set(sessionId, session)

  return
})
