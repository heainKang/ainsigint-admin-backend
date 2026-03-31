import { DataSource } from "typeorm";
import dotenv from 'dotenv';
dotenv.config();

import { AdminPanelServiceDefinition } from '../models/admin_panel_servicedefinition.entity.js';
import { AdminPanelPricingPlan } from '../models/admin_panel_pricingplan.entity.js';

export const AppDataSource_homepage = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE_HOMEPAGE,
  entities: [AdminPanelServiceDefinition, AdminPanelPricingPlan],
  synchronize: false, // 필요에 따라 설정
  timezone: 'Asia/Seoul', // 한국 시간대 설정
  extra: {
    timezone: 'Asia/Seoul'
  }
});
