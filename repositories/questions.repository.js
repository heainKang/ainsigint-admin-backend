import { db_homepage } from "../config/db_homepage.js";

export async function find(page, limit, info = {}) {
    try {
      // 결제완료: pay_status(승인완료) / 입금대기: pay_status(입금대기) / 취소환불: cancel_status(1)
      page = Number(page) || 1;
      limit = Number(limit) || 10;
      const offset = (page - 1) * limit;
  
      // 테넌트 목록 추출
      let tenantSchemas;
      if (info.tenant_list && info.tenant_list.length > 0) {
        tenantSchemas = info.tenant_list.map((t) => ({ schema_name: t }));
      } else {
        const { rows: schemas } = await db_homepage.query(`
          SELECT schema_name
          FROM information_schema.schemata
          WHERE schema_name LIKE 'tenant_%'
        `);
        tenantSchemas = schemas;
      }
  
      // 날짜 필터 조건 생성
      let baseConditions =[];
      if (info.start_date) {
        const startDate = new Date(info.start_date).toISOString();
        baseConditions.push(`q.created_at >= '${startDate}'`);
      }
      if (info.end_date) {
        const tempDate = new Date(info.end_date);
        tempDate.setDate(tempDate.getDate() + 1); // 하루 뒤로
        const endDate = tempDate.toISOString();
        baseConditions.push(`q.created_at < '${endDate}'`);
      }

      // 답변 상태
      if (info.answer_status !== undefined && info.answer_status !== null) {
        const answerStatus = info.answer_status;  // 모든 공백 제거
        console.log(answerStatus);
        baseConditions.push(`q.status_id = '${answerStatus}'`);
      }

      // 문의 유형
      if (info.type_id !== undefined && info.type_id !== null) {
        const questionTypeId = info.type_id;  // 모든 공백 제거
        console.log(questionTypeId);
        baseConditions.push(`q.question_type_id = '${questionTypeId}'`);
      }

      const queries = tenantSchemas.map((s) => {
        const schema = s.schema_name;  
        const whereClause = baseConditions.length > 0
            ? `WHERE ${baseConditions.join(" AND ")}`
            : "";
      
        return `
            SELECT '${schema}' AS tenant, q.*, qt.name as type_name
            FROM "${schema}"."questions_userquestion" q
            LEFT JOIN public.admin_panel_questiontype qt  
                ON q.question_type_id = qt.id
            ${whereClause}
        `;

        // return `
        //     SELECT '${schema}' AS tenant, q.*
        //     FROM "${schema}"."questions_userquestion" q
        //     ${whereClause}
        // `;
      });

      const unionQuery = queries.join(" UNION ALL ");
      
      // 전체 row 수 조회
      const countQuery = `
        SELECT COUNT(*) AS total_count FROM (${unionQuery}) AS all_data
      `;
      const { rows: countResult } = await db_homepage.query(countQuery);
      const totalCount = parseInt(countResult[0].total_count, 10);
  
      // // 전체 금액 합산
      // const totalAmountQuery = `
      //   SELECT COALESCE(SUM(total_price) - SUM(refund_amount), 0) AS total_amount FROM (${unionQuery}) AS all_data
      // `;
      // const { rows: amountResult } = await db_homepage.query(totalAmountQuery);
      // const total_amount = Number(amountResult[0].total_amount);

      // 금액 구하기 쿼리
      // const queriesWithoutConditions = tenantSchemas.map((s) => {
      //   const schema = s.schema_name;
      
      //   return `
      //     SELECT 
      //       '${schema}' AS tenant, 
      //       p.*, 
      //       c.cancel_status, 
      //       c.refund_amount
      //     FROM "${schema}"."payments_payment" p
      //     LEFT JOIN "${schema}"."payments_paymentcancellation" c 
      //       ON p.id = c.payment_id
      //     WHERE pay_status = '승인완료'
      //   `;
      // });
      // const unionQueryWithoutConditions = queriesWithoutConditions.join(" UNION ALL ");

      // // ✅ 전체 금액 합산 (조건 없는 unionQuery 사용)
      // const totalAmountQuery = `
      // SELECT 
      //   COALESCE(SUM(total_price) - SUM(COALESCE(refund_amount, 0)), 0) AS total_amount 
      // FROM (${unionQueryWithoutConditions}) AS all_data
      // `;
      // const { rows: amountResult } = await db_homepage.query(totalAmountQuery);
      // const total_amount = Number(amountResult[0].total_amount);
     
  
      // 페이지네이션 적용된 결제 내역 조회
      const paginatedQuery = `
        SELECT * FROM (${unionQuery}) AS all_data
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
      const { rows: questionsRow } = await db_homepage.query(paginatedQuery);

      
      console.log("questionRow == ", questionsRow);

      

      return { total_count :totalCount, questions_list : questionsRow};
      // return {
      //   totalCount,
      //   total_amount,
      //   paymentHistory_list: paymentRows
      // };
    } catch (error) {
      console.error("❌ error = ", error);
      throw error;
    }
}

export async function findOne(schema, question_id) {
  try {
    const query = `
          SELECT '${schema}' AS tenant, q.*, qt.name as type_name
          FROM "${schema}"."questions_userquestion" q
          LEFT JOIN public.admin_panel_questiontype qt  
              ON q.question_type_id = qt.id
          WHERE q.id = ${question_id}
      `;
    
    const question = await db_homepage.query(query);


    return question.rows[0];
  } catch (error) {
    console.error("❌ error = ", error);
    throw error;
  }
}

