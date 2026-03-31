import { EntitySchema } from "typeorm";

export const coupon_plan_mapping = new EntitySchema({
  name: "coupon_plan_mapping",
  tableName: "coupon_plan_mapping",
  columns: {
    id: {
      type: Number,
      primary: true,
      generated: true
    },
    coupon_id : {
        type: Number
    },
    pricing_plan_id: {
        type: Number
    },
    count: {
        type: Number
    }
  }
});