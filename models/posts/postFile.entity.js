import { EntitySchema } from "typeorm";

export const PostFile = new EntitySchema({
  name: "PostFile",
  tableName: "post_files",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    type: {
      type: "varchar",
      length: 20,
      nullable: false,
    },
    post_id: {
      type: "int",
      nullable: false,
    },
    original_filename: {
      type: "varchar",
      length: 255,
      nullable: false,
    },
    saved_filename: {
      type: "varchar",
      length: 255,
      nullable: false,
    },
    file_url: {
      type: "varchar",
      length: 500,
      nullable: false,
    },
    size: {
      type: "int",
      default: 0,
    },
    mimetype: {
      type: "varchar",
      length: 100,
      nullable: true,
    },
    uploaded_at: {
      type: "timestamp with time zone",
      createDate: true,
    },
  },
});