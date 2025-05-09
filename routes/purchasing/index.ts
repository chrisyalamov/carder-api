import { Hono } from "npm:hono"
import { Env } from "../../main.ts"
import { zValidator } from "@hono/zod-validator"
import { describeRoute } from "hono-openapi"
import { addOrChangeCartItem_POST_RequestBody_Schema } from "./validators.ts"
import { jsonBodySchemaFromZod } from "../../utils/zod-json-request-body.ts"
import { computeTotals } from "../../utils/compute-totals.ts"
import { z } from "zod"
import { randomBytes } from "node:crypto"
import { checkSessionAuthenticated } from "../../utils/req-check-auth.ts"
import { testPermissionsForRequest } from "../../utils/policy-test.ts"
import { purchaseOrders } from "../../db/schema/purchaseOrders.ts"
import { lineItems } from "../../db/schema/lineItems.ts"
import { checkoutSessions } from "../../db/schema/checkoutSessions.ts"
import { eq } from "drizzle-orm/expressions"
import { fulfillOrder } from "./utils.ts"
import { HTTPException } from "hono/http-exception"
import { ApplicationError } from "../../utils/application-error.ts"
import { licenses } from "../../db/schema/licenses.ts";
import { env } from 'npm:hono/adapter'

// API handler for /purchasing
const app = new Hono<Env>()

// /getCart
app.get(
  "/getCart",
  describeRoute({
    description: "Get the current cart for the current user",
  }),
  async (c) => {
    const { database: db, session } = c.var
    const cart = session?.cart || { cartLineItems: [] }

    if (!cart?.cartLineItems) return c.json([])

    const lineItemsWithTotals = await computeTotals(db, cart?.cartLineItems)
    const total = lineItemsWithTotals.reduce((acc, item) => {
      return acc + parseFloat(item.totalPrice)
    }, 0)

    // Remove any existing UIC token s
    const existingTokens = Object.keys(session.continuity).filter(
      (key) => session.continuity[key].intent === "checkout"
    )
    existingTokens.forEach((token) => {
      delete session.continuity[token]
    })

    // Create new User Intent Continuity (UIC) token
    const randomToken = randomBytes(32).toString("hex")
    session.continuity[randomToken] = {
      total,
      currency: lineItemsWithTotals[0]?.currency ?? "GBP",
      intent: "checkout",
      issuedAt: Date.now(),
    }

    return c.json({
      lineItemsWithTotals,
      uic: randomToken,
    })
  }
)

// /addOrChangeCartItem
app.on(
  ["POST", "PUT", "PATCH"],
  "/addOrChangeCartItem",
  zValidator("form", addOrChangeCartItem_POST_RequestBody_Schema),
  describeRoute({
    description: "Add or change a cart item",
    requestBody: {
      content: {
        "application/json": jsonBodySchemaFromZod(
          addOrChangeCartItem_POST_RequestBody_Schema
        ),
      },
    },
  }),
  (c) => {
    let { cart } = c.var.session
    const { session } = c.var
    const { skuId, quantity } = c.req.valid("form")

    cart = cart || { cartLineItems: [] }

    const existingItemIndex = cart.cartLineItems.findIndex(
      (item) => item.skuId === skuId
    )

    // Check if an item with the same SKU ID already exists in the cart
    if (existingItemIndex > -1) {
      // If the SKU is already added, update the quantity

      if (quantity === 0) {
        // if the quantity is 0, remove the item from the cart
        cart.cartLineItems.splice(existingItemIndex, 1)
      } else {
        // otherwise, update the quantity
        cart.cartLineItems[existingItemIndex].quantity = quantity
      }
    } else {
      cart.cartLineItems.push({ skuId, quantity })
    }

    let randomToken
    if (c.req.valid("form").removeAllOtherItems === "true") {
      // If removeAllOtherItems is true, clear all other items
      cart.cartLineItems = [{ skuId, quantity }]

      // Create Buy Now UIC token
      randomToken = randomBytes(32).toString("hex")
      session.continuity[randomToken] = {
        quantity,
        currency: "GBP",
        intent: "buyNow",
        issuedAt: Date.now(),
      }
    }

    c.var.session.cart = cart

    return c.json({
      lineItems: cart.cartLineItems,
      buyNowUIC: randomToken,
    })
  }
)

// /clearCart
app.post(
  "/clearCart",
  describeRoute({
    description: "Clear the cart",
  }),
  (c) => {
    const cart = c.get("session")?.cart || { cartLineItems: [] }
    cart.cartLineItems = []

    c.var.session.cart = cart
    return c.json(cart)
  }
)

// /initiateCheckout
app.post(
  "/stripe/initiateCheckout",
  describeRoute({
    description: "Initiate the checkout process",
    requestBody: {
      content: {
        "application/json": jsonBodySchemaFromZod(
          z.object({
            organisationId: z.string().ulid(),
            uic: z.string(),
          })
        ),
      },
    },
  }),
  zValidator(
    "json",
    z.object({
      uic: z.string(),
      organisationId: z.string().ulid(),
      total: z.coerce.number(),
      currency: z.string(),
    })
  ),
  async (c) => {
    const data = c.req.valid("json")
    const { BACKEND_URL } = env(c)

    // Ensure user is authenticated and permitted to manage licenses
    checkSessionAuthenticated(c)
    await testPermissionsForRequest(
      c,
      "organisation",
      data.organisationId,
      "manage_licenses"
    )

    // Initiate stripe checkout session
    const { database: db, stripe, session } = c.var

    const { cart } = session
    if (!cart?.cartLineItems) throw new Error("Cart is empty")

    const cartLineItemsWithTotals = await computeTotals(db, cart.cartLineItems)
    const currency = cartLineItemsWithTotals[0].currency
    if (!currency) throw new Error("Unknown error occurred")

    const total = cartLineItemsWithTotals.reduce(
      (acc, line) => (acc += parseFloat(line.totalPrice)),
      0
    )

    // Check User Intent Continuity (UIC) token
    // This is to prevent CSRF attacks
    const foundUic = session.continuity?.[data.uic]
    if (!foundUic) throw new Error("Invalid UIC. Please try again.")

    const conditions = [
      // If the intent is not buyNow, the total must match
      foundUic?.intent === "buyNow" || foundUic?.total === data.total,
      foundUic?.currency.toLowerCase() === data.currency.toLowerCase(),
      foundUic?.intent.toLowerCase() === "checkout" ||
        foundUic?.intent.toLowerCase() === "buynow",
      foundUic?.issuedAt + 1000 * 60 * 5 > Date.now(),
    ]

    if (!conditions.every(Boolean)) {
      throw new Error("UIC is invalid or expired. Please try again.")
    }

    /**
     * Database transaction
     *
     * This transaction stores the purchase order, its line items, and a
     * checkout session object in the database.
     */
    const ts = await db.transaction(async (tx) => {
      const po = await tx
        .insert(purchaseOrders)
        .values({
          organisationId: data.organisationId,
        })
        .returning({
          purchaseOrderId: purchaseOrders.purchaseOrderId,
        })

      const purchaseOrderId = po[0].purchaseOrderId

      await tx.insert(lineItems).values(
        cartLineItemsWithTotals.map((item) => ({
          purchaseOrderId,
          skuId: item.skuId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          currency: item.currency,
          skuName: item.skuName,
          appliedBulkPricingOfferId: item.appliedBulkPricingOfferId,
          type: item.type,
          skuCode: item.skuCode,
        }))
      )

      const checkoutSession = await tx
        .insert(checkoutSessions)
        .values({
          purchaseOrderId,
          organisationId: data.organisationId,
        })
        .returning({
          checkoutSessionId: checkoutSessions.checkoutSessionId,
        })

      return {
        purchaseOrderId,
        checkoutSessionId: checkoutSession[0].checkoutSessionId,
      }
    })

    const stripeSession = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: "Licensing products",
            },
            unit_amount: Math.round(total * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${BACKEND_URL}/purchasing/stripe/success?checkoutSessionId=${ts.checkoutSessionId}`,
      cancel_url: `${BACKEND_URL}/purchasing/stripe/cancel?checkoutSessionId=${ts.checkoutSessionId}`,
      metadata: {
        purchaseOrderId: ts.purchaseOrderId,
        internalCheckoutSessionId: ts.checkoutSessionId,
      },
    })

    // Store the stripe session ID in the database
    await db
      .update(checkoutSessions)
      .set({
        stripeSessionId: stripeSession.id,
      })
      .where(eq(checkoutSessions.checkoutSessionId, ts.checkoutSessionId))

    if (!stripeSession.url)
      throw new Error("Something went wrong while inititating the payment")

    // Clear UIC token (to prevent reuse)
    delete session.continuity[data.uic]
    return c.json({
      url: stripeSession.url,
    })
  }
)

// /success
app.get(
  "/stripe/success",
  describeRoute({
    description: "Handle successful checkout session",
    parameters: [
      {
        in: "query",
        name: "checkoutSessionId",
        required: true,
      },
    ],
  }),
  zValidator("query", z.object({ checkoutSessionId: z.string() })),
  async (c) => {
    const { database: db, stripe, session } = c.var
    const checkoutSessionId = c.req.valid("query").checkoutSessionId
    const { FRONTEND_URL } = env(c)

    const transaction = await db.transaction(async (tx) => {
      const session = await tx
        .select()
        .from(checkoutSessions)
        .where(eq(checkoutSessions.checkoutSessionId, checkoutSessionId))
        .limit(1)
        .for("update")

      if (!session) {
        throw new HTTPException(404, {
          message: "Checkout session not found",
        })
      }

      const purchaseOrderId = session[0].purchaseOrderId

      const po = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId))
        .limit(1)
        .for("update")

      if (!session[0]?.stripeSessionId || !po) {
        throw new Error("Problem retrieving purchase order")
      }

      const stripeSession = await stripe.checkout.sessions.retrieve(
        session[0].stripeSessionId
      )

      if (!stripeSession || stripeSession?.payment_status !== "paid") {
        throw new Error("Payment not completed successfully")
      }

      await tx
        .update(checkoutSessions)
        .set({
          status: "paid",
        })
        .where(eq(checkoutSessions.checkoutSessionId, checkoutSessionId))

      await tx
        .update(purchaseOrders)
        .set({
          status: "paid",
        })
        .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId))

      return { session, po }
    })

    try {
      await fulfillOrder(db, transaction.po[0].purchaseOrderId)

      // Empty the cart
      session.cart = { cartLineItems: [] }
    } catch (error) {
      throw new ApplicationError(
        "Something went wrong while fulfilling the order. Please contact support.",
        "FailedToFulfillOrder",
        500,
        "FulfillOrderError",
        {
          error,
        }
      )
    }

    // Redirect to the success page
    return c.redirect(
      `${FRONTEND_URL}/app/${transaction.po[0].organisationId}/licensing/success?po=${transaction.po[0].purchaseOrderId}`
    )
  }
)

// /cancel
app.get(
  "/stripe/cancel",
  describeRoute({
    description: "Handle canceled checkout session",
    parameters: [
      {
        in: "query",
        name: "checkoutSessionId",
        required: true,
      },
    ],
  }),
  zValidator("query", z.object({ checkoutSessionId: z.string() })),
  async (c) => {
    const checkoutSessionId = c.req.valid("query").checkoutSessionId
    const { FRONTEND_URL } = env(c)

    const { database: db } = c.var

    /**
     * Mark the checkout session and order as canceled in the database
     */
    const transaction = await db.transaction(async (tx) => {
      const session = await tx
        .select()
        .from(checkoutSessions)
        .where(eq(checkoutSessions.checkoutSessionId, checkoutSessionId))
        .limit(1)
        .for("update")

      if (!session) {
        throw new HTTPException(404, {
          message: "Checkout session not found",
        })
      }

      await tx
        .update(checkoutSessions)
        .set({
          status: "canceled",
        })
        .where(eq(checkoutSessions.checkoutSessionId, checkoutSessionId))

      return await tx
        .update(purchaseOrders)
        .set({
          status: "canceled",
        })
        .where(eq(purchaseOrders.purchaseOrderId, session[0].purchaseOrderId))
        .returning({
          purchaseOrderId: purchaseOrders.purchaseOrderId,
          organisationId: purchaseOrders.organisationId,
        })
    })

    // Redirect to the cancel page
    return c.redirect(
      `${FRONTEND_URL}/app/${transaction[0].organisationId}/licensing/cancel?po=${transaction[0].purchaseOrderId}`
    )
  }
)

// /getPurchaseOrder
app.get(
  "/getPurchaseOrder",
  describeRoute({
    description: "Get a purchase order by ID",
    parameters: [
      {
        in: "query",
        name: "purchaseOrderId",
        required: true,
      },
    ],
  }),
  zValidator("query", z.object({ purchaseOrderId: z.string().ulid() })),
  async (c) => {
    const { database: db } = c.var
    // Check user is authenticated
    checkSessionAuthenticated(c)

    const purchaseOrderId = c.req.valid("query").purchaseOrderId
    const po = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId))
      .limit(1)

    if (!po) {
      throw new HTTPException(404, {
        message: "Purchase order not found",
      })
    }

    // Check if the user is allowed to view this purchase order
    await testPermissionsForRequest(
      c,
      "organisation",
      po[0].organisationId,
      "manage_licenses"
    )

    const poLineItems = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.purchaseOrderId, purchaseOrderId))

    const poLicenses = await db
      .select()
      .from(licenses)
      .where(eq(licenses.purchaseOrderId, purchaseOrderId))

    return c.json({
      purchaseOrder: po[0],
      lineItems: poLineItems,
      licenses: poLicenses,
    })
  }
)

// /getAllPurchaseOrders
app.get(
  "/getAllPurchaseOrders",
  describeRoute({
    description: "Get all purchase orders for an organisation",
    parameters: [
      {
        in: "query",
        name: "organisationId",
        required: true,
      },
    ],
  }),
  zValidator("query", z.object({ organisationId: z.string().ulid() })),
  async (c) => {
    const { database: db } = c.var
    // Check user is authenticated
    checkSessionAuthenticated(c)

    const organisationId = c.req.valid("query").organisationId


    // Check if the user is allowed to view this organisation
    await testPermissionsForRequest(
      c,
      "organisation",
      organisationId,
      "manage_licenses"
    )

    const pos = await db
      .select()
      .from(purchaseOrders)
      .where(
        eq(purchaseOrders.organisationId, organisationId)
      )

    return c.json(pos)
  }
)

export default app
