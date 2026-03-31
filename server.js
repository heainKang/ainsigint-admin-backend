import "reflect-metadata";
import express from 'express';
import cors from 'cors';
import dotenv from "dotenv";
import path from 'path';


dotenv.config(); // 기본 .env 파일 (개발환경)
console.log('🔧 환경 설정 로드: .env');


// console-stamp
import consoleStamp from 'console-stamp'; // console.log 시간 정보 추가
consoleStamp(console, ['yyyy/mm/dd HH:MM:ss.l']);

// DB typeORM
import { AppDataSource_admin } from "./config/data-sources_admin.js";
import { AppDataSource_homepage } from "./config/data-sources_homepage.js";

AppDataSource_admin.initialize()
  .then( async () => {
    console.log("Data Source_admin has been initialized!");
  })
  .catch((err) => {
    console.error("Error during Data Source initialization:", err);
});

AppDataSource_homepage.initialize()
  .then( async () => {
    console.log("Data Source_homepage has been initialized!");
  })
  .catch((err) => {
    console.error("Error during Data Source initialization:", err);
});

// routes
import userRoutes from './routes/user.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import adminRoutes from './routes/admin.routes.js';
import statisticRoutes from './routes/statistic.routes.js';
import promotionRoutes from './routes/promotion.routes.js';
import questionsRoutes from './routes/questions.routes.js';
import pricingRoutes from './routes/pricing.routes.js';
// editor cleanup
import { cleanupEditorFiles } from './utils/editorCleanup.js';
// statistics batch scheduler
import { StatisticsBatchScheduler } from './utils/statisticsBatchScheduler.js';



// Sentry
// import * as Sentry from "@sentry/node";

// Sentry.init({
//   dsn: process.env.DSN,
//   integrations: [Sentry.captureConsoleIntegration()],
//   environment: 'production',
//   normalizeDepth: 6,
//   // Performance Monitoring
//   tracesSampleRate: 1.0, //  Capture 100% of the transactions
//   // Set sampling rate for profiling - this is relative to tracesSampleRate
//   profilesSampleRate: 1.0,
// });

const app = express();
const PORT = process.env.SERVER_PORT;
// const SOCKET_PORT = process.env.SOCKET_PORT;

app.use(express.json());
app.use(cors());

// 관리자게시판용 정적 파일 제공 (업로드된 파일들) // ✅ 반드시 라우터보다 위에!(먼저 읽혀야함)) 프론트 프록시 + 백 정적파일설정필요(다운로드)
/*
app.use('/uploads', express.static(path.resolve(uploadBasePath)));  코드의 의미:

  URL: http://localhost:8109/uploads/editor/manual/file.png
  실제 파일: /var/www/admin/uploads/editor/manual/file.png

  핵심: Express가 URL 경로와 실제 파일시스템 경로를 매핑해주는 기능입니다. 사용자는
  /uploads/... URL로 접근하지만, Express는 실제로 /var/www/admin/uploads/... 경로에서
   파일을 찾아서 제공합니다.

*/
import { getUploadBasePath, printUploadConfig } from './utils/uploadPaths.js';

const uploadBasePath = getUploadBasePath();
app.use('/uploads', express.static(path.resolve(uploadBasePath)));
console.log(`📁 정적 파일 서빙 경로: ${uploadBasePath}`);

// Routes
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes); //게시판, 요금관리 포함
app.use('/api/payment', paymentRoutes);
app.use('/api/promotion', promotionRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/statistic', statisticRoutes);
app.use('/api/pricing', pricingRoutes); //홈페이지용 요금조회(추가개발)

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  
  setTimeout(async () => {
    try {
      //console.log('🧹 서버 시작 시 에디터 파일 정리 실행...');
      const stats = await cleanupEditorFiles();
      //console.log(`✅ 서버 시작 시 정리 완료 - 삭제: ${stats.deleted}개, 유지: ${stats.kept}개`);
      
      // 통계 배치 스케줄러 시작
      //console.log('📊 통계 배치 스케줄러 시작...');
      const batchScheduler = new StatisticsBatchScheduler(); // util
      batchScheduler.start(); //cron 스케줄 등록 (매일새벽2시, 수동실행시 /api/statistic/batch/run) --구매건수가 있는데 데이터상 0으로 insert된 경우 구매취소된 경우입니다.
    } catch (error) {
      console.error('❌ 서버 시작 시 정리 실패:', error);
    }
  }, 3000); // 3초 대기 후 실행( DB 초기화 대기 후 에디터 파일 정리 실행으로 3초 대기 TypeORM에서 엔티티 불러오는데 시간 필요했었음. )
});