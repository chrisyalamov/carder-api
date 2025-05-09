import { z } from "zod";
import { skus } from "../db/schema/skus.ts";
import { bulkPricingOffers } from "../db/schema/bulkPricingOffers.ts";

type Sku = typeof skus.$inferSelect
type BulkPricingOffer = typeof bulkPricingOffers.$inferSelect

type AggregatedSku = Sku & {
    bulkPricingOffers: BulkPricingOffer[]
  }

type Row = {
    skus: Sku
    bulk_pricing_offers: BulkPricingOffer | null
}

export const aggregateSkus = (skus: Row[]) => skus.reduce<AggregatedSku[]>((acc, row) => {
        const skuId = row.skus.skuId
        const existingSku = acc.find((sku) => sku.skuId === skuId)
    
        if (existingSku) {
          // If the SKU already exists, add the bulk offer to it
          if (row?.bulk_pricing_offers) {
            existingSku.bulkPricingOffers.push(row.bulk_pricing_offers)
          }
        } else {
          // If the SKU doesn't exist, create a new one
          acc.push({
            ...row.skus,
            bulkPricingOffers: row.bulk_pricing_offers
              ? [row.bulk_pricing_offers]
              : [],
          })
        }

        return acc
    }, [])