import { EntitySchema } from "typeorm";

export const AdminPanelServiceDefinition = new EntitySchema({
  name: "AdminPanelServiceDefinition",
  tableName: "admin_panel_servicedefinition",
  columns: {
    id: {
      type: "bigint",
      primary: true,
      generated: true
    },
    name: {
      type: "varchar",
      length: 100,
      nullable: false
    },
    logo_image: {
      type: "varchar", 
      length: 100,
      nullable: false
    },
    uploaded_at: {
      type: "timestamptz",
      nullable: false
    },
    description: {
      type: "varchar",
      length: 255,
      nullable: false
    },
    description_eng: {
      type: "varchar",
      length: 255,
      nullable: true
    }
  },
  relations: {
    pricingPlans: {
      target: "AdminPanelPricingPlan",
      type: "one-to-many",
      inverseSide: "serviceDefinition"
    }
  }
});