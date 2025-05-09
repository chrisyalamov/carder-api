import { z } from "zod"

export const cartItemSchema = z.object({
  skuId: z.string().ulid(),
  quantity: z.coerce.number().min(1),
  lineTotal: z.number().optional(),
  lineTotalCurrency: z.string().optional(),
})

export const addOrChangeCartItem_POST_RequestBody_Schema =
  cartItemSchema.setKey("removeAllOtherItems", z.string().optional())
