import { EntitySchema } from "typeorm";

export const coupon_user_mapping = new EntitySchema({
  name: "coupon_user_mapping",
  tableName: "coupon_user_mapping",
  columns: {
    id: {
      type: Number,
      primary: true,
      generated: true
    },
    coupon_id : {
        type: Number
    },
    user_id: {
        type: Number
    }
  }
});