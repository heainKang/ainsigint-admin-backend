import { EntitySchema } from "typeorm";

export const NewsPost = new EntitySchema({
  name: "NewsPost",
  tableName: "news_posts",
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
    thumbnail_url: {
      type: "varchar",
      length: 500,
      nullable: true,
    },
    created_by: {
      type: "varchar",
      length: 100,
      default: "관리자",
    },
    created_at: {
      type: "timestamp with time zone",
      createDate: true,
    },
    updated_at: {
      type: "timestamp with time zone",
      updateDate: true,
    },
    thumbnail_original_name: { 
      type: "varchar",
      nullable: true, 
      length: 255 
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