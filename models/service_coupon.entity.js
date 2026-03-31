import { EntitySchema } from "typeorm";

export const service_coupon = new EntitySchema({
  name: "service_coupon",
  tableName: "service_coupon",
  columns: {
    id: {
      type: Number,
      primary: true,
      generated: true
    },
    name : {
        type: String
    },
    duration: {
        type: Number
    },
    created_at: {
        type: Date,
        createDate: true
    }
  }
});