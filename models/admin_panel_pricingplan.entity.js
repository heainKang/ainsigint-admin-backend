import { EntitySchema } from "typeorm";

export const AdminPanelPricingPlan = new EntitySchema({
  name: "AdminPanelPricingPlan",
  tableName: "admin_panel_pricingplan",
  columns: {
    id: {
      type: "bigint",
      primary: true,
      generated: true
    },
    name: {
      type: "varchar",
      length: 20,
      nullable: false
    },
    type: {
      type: "varchar",
      nullable: false
    },
    price: {
      type: "integer",
      nullable: false
    },
    duration: {
      type: "integer",
      nullable: false
    },
    service_id: {
      type: "bigint",
      nullable: false
    },
    display_title: {
      type: "varchar",
      length: 20,
      nullable: true
    },
    is_active: {
      type: "boolean",
      nullable: false
    },
    created_at: {
      type: "timestamptz",
      nullable: false,
      default: () => "now()"
    },
    updated_at: {
      type: "timestamptz",
      nullable: false
    }
  },
  relations: {
    serviceDefinition: {
      target: "AdminPanelServiceDefinition",
      type: "many-to-one",
      joinColumn: {
        name: "service_id",
        referencedColumnName: "id"
      }
    }
  }
});