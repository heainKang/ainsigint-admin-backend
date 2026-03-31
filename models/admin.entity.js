import { EntitySchema } from "typeorm";

export const admin = new EntitySchema({
  name: "admin",
  tableName: "admin",
  columns: {
    id: {
      type: Number,
      primary: true,
      generated: true
    },
    email : {
        type: String
    },
    password: {
        type: String
    },
    name: {
        type: String,
        nullable: true
    },
    contact: {
        type: String,
    },
    created_at: {
        type: Date,
        createDate: true
    }
  }
});