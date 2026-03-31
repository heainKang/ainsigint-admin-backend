import { EntitySchema } from "typeorm";

export const PaperPost = new EntitySchema({
  name: "PaperPost",
  tableName: "paper_posts",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    title: {
      type: "varchar",
      length: 255,
      nullable: false,
    },
    content: {
      type: "text",
      nullable: true,
    },
    created_by: {
      type: "varchar",
      length: 100,
      default: "관리자",
    },
    reference: {
      type: "varchar",
      length: 255,
      nullable: true,
    },
    created_at: {
      type: "timestamp with time zone",
      createDate: true,
    },
    updated_at: {
      type: "timestamp with time zone",
      updateDate: true,
    },
  },
  relations: {
    files: {
      target: "PostFile",
      type: "one-to-many",
      inverseSide: "post_id",
      cascade: true,
    },
  },
});