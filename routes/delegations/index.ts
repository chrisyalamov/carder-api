import { Hono, TypedResponse } from 'hono'
import { Env } from "../../main.ts";
import { delegations } from "../../db/schema/delegations.ts";
import { validator } from 'hono/validator'
import { HTTPException } from 'hono/http-exception'
import { eq } from "drizzle-orm";

const app = new Hono<Env>()

type DelegationsListResponse = Promise<TypedResponse<
  typeof delegations.$inferSelect[]
>>

// GET (list) all delegations
app.get('/', async (c): DelegationsListResponse => {
  const db = c.get("database")
  const result = await db.select().from(delegations);
  return c.json(result)
})

type DelegationGetResponse = Promise<TypedResponse<
  typeof delegations.$inferSelect
>>

// GET specific delegation
app.get(
  '/:delegationId',

  // Validate params
  validator("param", value => {
    if ('delegationId' in value && typeof value.delegationId === 'string') {
      return value.delegationId
    } else {
      throw new HTTPException(400, {
        message: "The delegationId parameter is required and must be a string"
      })
    }
  }),

  // Handle requesst
  async (c): DelegationGetResponse => {
    const db = c.get("database")
    const delegationId = c.req.valid('param')

    const result = await db.select().from(delegations).where(
      eq(delegations.delegationId, delegationId)
    ).limit(1);

    return c.json(result[0])
  }
)

export default app