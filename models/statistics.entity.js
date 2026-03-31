import { EntitySchema } from "typeorm";

export const Statistics = new EntitySchema({
  name: "Statistics",
  tableName: "statistics",
  columns: {
    date: {
      type: "date",
      primary: true,
      nullable: false
    },
    service_id: {
      type: "smallint",
      primary: true,
      nullable: false
    },
    type: {
      type: "smallint",
      primary: true,
      nullable: false
    },
    user_type: {
      type: "smallint",
      primary: true,
      nullable: false
    },
    total_sales_count: {
      type: "integer",
      nullable: true,
      default: 0
    },
    total_sales_price: {
      type: "decimal",
      precision: 10,
      scale: 2,
      nullable: true,
      default: 0
    },
    total_granted_count: {
      type: "integer",
      nullable: true,
      default: 0
    },
    total_onetime_use_count: {
      type: "integer",
      nullable: true,
      default: 0
    },
    total_coupon_use_count: {
      type: "integer",
      nullable: true,
      default: 0
    },
    created_at: {
      type: "timestamp",
      nullable: true,
      default: () => "CURRENT_TIMESTAMP"
    },
    updated_at: {
      type: "timestamp",
      nullable: true,
      default: () => "CURRENT_TIMESTAMP"
    }
  }
});