import { DataSource } from "typeorm";
import dotenv from 'dotenv';
dotenv.config();

import { admin } from '../models/admin.entity.js';
import { service_coupon } from "../models/service_coupon.entity.js";
import { coupon_plan_mapping } from "../models/coupon_plan_mapping.entity.js";
import { coupon_user_mapping } from "../models/coupon_user_mapping.entity.js";
import { ManualPost } from '../models/posts/manualPost.entity.js';
import { PaperPost } from '../models/posts/paperPost.entity.js';
import { NewsPost } from '../models/posts/newsPost.entity.js';
import { PostFile } from '../models/posts/postFile.entity.js';
import { Statistics } from '../models/statistics.entity.js';

export const AppDataSource_admin = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE_ADMIN,
  entities: [admin, service_coupon, coupon_user_mapping, coupon_plan_mapping, ManualPost, PaperPost, NewsPost, PostFile, Statistics],
  synchronize: false, // 필요에 따라 설정
  timezone: 'Asia/Seoul', // 한국 시간대 설정
  extra: {
    timezone: 'Asia/Seoul'
  },

  //개발에서만 찍어볼 것.
  // DataSource 옵션으로 전역 로깅
  //logging: ['query', 'error'],   // 또는 true, 또는 ['query','error','schema','warn']
  //logger: 'advanced-console',
  //maxQueryExecutionTime: 200,    // 200ms 넘는 쿼리 슬로우 표시

});

