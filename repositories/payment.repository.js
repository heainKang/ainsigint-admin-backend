import { db_homepage } from "../config/db_homepage.js";

export async function getPayments(page, limit, info = {}) {
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

      let baseConditions =[];
      // 날짜 필터 조건 생성
      if (info.start_date) {
        const startDate = new Date(info.start_date).toISOString();
        baseConditions.push(`p.created_at >= '${startDate}'`);
      }
      if (info.end_date) {
        const tempDate = new Date(info.end_date);
        tempDate.setDate(tempDate.getDate() + 1); // 하루 뒤로
        const endDate = tempDate.toISOString();
        baseConditions.push(`p.created_at < '${endDate}'`);
      }
      
      // 결제 상태 조건 생성
      if (info.pay_status !== undefined && info.pay_status !== null) {
        const cleanStatus = info.pay_status.replace(/\s+/g, '');  // 모든 공백 제거
        baseConditions.push(`p.pay_status = '${cleanStatus}'`);
      }

      // 조건에 맞춰 쿼리 정립
      const queries = tenantSchemas.map((s) => {
        // 스키마 
        const schema = s.schema_name;

        // 드랍박스 취소 환불 상태 보기
        if (info.cancel_status === true || info.cancel_status === 'true') {
          // 취소환불 드랍박스 선택 시 쿼리문
          const whereClause = baseConditions.length > 0
            ? `WHERE ${baseConditions.join(" AND ")} AND c.payment_id IS NOT NULL`
            : `WHERE c.payment_id IS NOT NULL`;
      
          return `
            SELECT '${schema}' AS tenant, p.*, c.cancel_status, c.refund_amount
            FROM "${schema}"."payments_payment" p
            JOIN "${schema}"."payments_paymentcancellation" c ON p.id = c.payment_id
            ${whereClause}
          `;
        } else if(info.pay_status) { 
          // 거래상태(승인완료, 입금대기) 드랍박스 선택 시 쿼리문
          const whereClause = baseConditions.length > 0
            ? `WHERE ${baseConditions.join(" AND ")}`
            : "";
      
            return `
            SELECT 
              '${schema}' AS tenant, 
              p.*, 
              NULL AS cancel_status, 
              0 AS refund_amount
            FROM "${schema}"."payments_payment" p
            ${whereClause}
          `;        
        } else {
          const whereClause = baseConditions.length > 0
            ? `WHERE ${baseConditions.join(" AND ")}`
            : "";
      
            return `
            SELECT 
              '${schema}' AS tenant, 
              p.*, 
              c.cancel_status, 
              COALESCE(c.refund_amount, 0) AS refund_amount
            FROM "${schema}"."payments_payment" p
            LEFT JOIN "${schema}"."payments_paymentcancellation" c 
              ON p.id = c.payment_id
            ${whereClause}
          `;
        }
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
      const queriesWithoutConditions = tenantSchemas.map((s) => {
        const schema = s.schema_name;
      
        return `
          SELECT 
            '${schema}' AS tenant, 
            p.*, 
            c.cancel_status, 
            c.refund_amount
          FROM "${schema}"."payments_payment" p
          LEFT JOIN "${schema}"."payments_paymentcancellation" c 
            ON p.id = c.payment_id
          WHERE pay_status = '승인완료'
        `;
      });
      const unionQueryWithoutConditions = queriesWithoutConditions.join(" UNION ALL ");

      // ✅ 전체 금액 합산 (조건 없는 unionQuery 사용)
      const totalAmountQuery = `
        SELECT 
          COALESCE(SUM(total_price) - SUM(COALESCE(refund_amount, 0)), 0) AS total_amount 
        FROM (${unionQueryWithoutConditions}) AS all_data
      `;
      const { rows: amountResult } = await db_homepage.query(totalAmountQuery);
      const total_amount = Number(amountResult[0].total_amount);
     
  
      // 페이지네이션 적용된 결제 내역 조회
      const paginatedQuery = `
        SELECT * FROM (${unionQuery}) AS all_data
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
      const { rows: paymentRows } = await db_homepage.query(paginatedQuery);

      return {
        totalCount,
        total_amount,
        paymentHistory_list: paymentRows
      };
    } catch (error) {
      console.error("❌ error = ", error);
      throw error;
    }
}


// 테넌트 상관없이 결제내역 리스트 뽑아옴
export async function getHistory(page, limit) {
  try {
      const offset = (page - 1) * limit;

      const { rows: schemas } = await db_homepage.query(`
          SELECT schema_name
          FROM information_schema.schemata
          WHERE schema_name LIKE 'tenant_%'
          `);
			
      let queries = schemas.map(
      (s) => `SELECT '${s.schema_name}' AS tenant, * 
							FROM "${s.schema_name}"."payments_userassetshistory"
							WHERE payment_id IS NOT NULL
							`
      );

			
      const unionQuery = queries.join(" UNION ALL ");

			// 전체 row 수 쿼리
			const countQuery = `
      	SELECT COUNT(*) AS total_count FROM (
        ${unionQuery}
      	) AS all_data
    	`;

			// 전체 결제 총액 쿼리 (페이지네이션과 무관하게 전체 합산)
			const totalAmountQuery = `
				SELECT COALESCE(SUM(total_price), 0) AS total_amount FROM (
				${unionQuery}
				) AS all_data
			`; 

			const { rows: countResult } = await db_homepage.query(countQuery);
			const totalCount = parseInt(countResult[0].total_count, 10);

			// totalAmount 구하기
			const { rows: amountResult } = await db_homepage.query(totalAmountQuery);
			const totalAmount = Number(amountResult[0].total_amount);

      const fullQuery = `
        SELECT * FROM (
          ${unionQuery}
        ) AS all_data
        ORDER BY all_data.action_date DESC  -- 필요시 정렬 기준 조정
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      const result = await db_homepage.query(fullQuery);
      return {
				totalCount,
				totalAmount,
				history_list: result.rows,
			};
			
  } catch(error) {
      console.log("error = ", error);
  }
}

export async function findHistoryByTenant(tenant_list, page, limit, info) {
  try {
	const offset = (page - 1) * limit;
    const startDate = info.start_date ? new Date(info.start_date).toISOString() : null;
    // ✅ endDate는 하루 뒤로 밀어서 비교
		let endDate = null;
		if (info.end_date) {
			const tempDate = new Date(info.end_date);
			tempDate.setDate(tempDate.getDate() + 1); // 하루 뒤로
			endDate = tempDate.toISOString();
		}
    
    const queries = tenant_list.map((tenant) => {
      let whereClause = `payment_id IS NOT NULL`;

      if (startDate && endDate) {
        whereClause += ` AND action_date BETWEEN '${startDate}' AND '${endDate}'`;
      } else if (startDate) {
        whereClause += ` AND action_date >= '${startDate}'`;
      } else if (endDate) {
        whereClause += ` AND action_date <= '${endDate}'`;
      }

      return `
        SELECT '${tenant}' AS tenant, *
        FROM "${tenant}"."payments_userassetshistory"
        WHERE ${whereClause}
      `;
    });

		const paymentQueries = tenant_list.map((tenant) => {
      let whereClause = ``;

      if (startDate && endDate) {
        whereClause += `WHERE created_at BETWEEN '${startDate}' AND '${endDate}'`;
      } else if (startDate) {
        whereClause += `WHERE created_at >= '${startDate}'`;
      } else if (endDate) {
        whereClause += `WHERE created_at <= '${endDate}'`;
      }

      return `
        SELECT '${tenant}' AS tenant, *
        FROM "${tenant}"."payments_payment"
        ${whereClause}
      `;
    });

		
    const unionQuery = queries.join(" UNION ALL ");
		const paymentUnionQuery = paymentQueries.join(" UNION ALL ");
		
		const dataQuery = `
      SELECT * FROM (
        ${unionQuery}
      ) AS all_data
      ORDER BY action_date DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

		// ✅ count 쿼리 (limit/offset 없음)
    const countQuery = `
      SELECT COUNT(*) FROM (
        ${paymentUnionQuery}
      ) AS all_data
    `;

		
		
    const [dataResult, countResult] = await Promise.all([
      db_homepage.query(dataQuery),
      db_homepage.query(countQuery)
    ]);

		
    return {
      total_count: parseInt(countResult.rows[0].count, 10),
      history_list: dataResult.rows,
    };

  } catch (error) {
    console.error("❌ error = ", error);
    throw error;
  }
}

export async function getPaymentHistory(tenant, payment_id) {
  try {
    const query = `
      SELECT '${tenant}' AS tenant, *
      FROM "${tenant}"."payments_userassetshistory"
      WHERE action_type = 0 AND payment_id = $1 
    `;

    const result = await db_homepage.query(query, [payment_id]);
    return result.rows;

  } catch (error) {
    console.error("❌ error = ", error);
    throw error;
  }
}

// // history 함수의 기초
// export async function findHistory(tenant_list, page, limit) {
//   try {
//       const offset = (page - 1) * limit;

//       const { rows: schemas } = await db_homepage.query(`
//           SELECT schema_name
//           FROM information_schema.schemata
//           WHERE schema_name LIKE 'tenant_%'
//           `);
			
//       let queries = schemas.map(
//       (s) => `SELECT '${s.schema_name}' AS tenant, * 
// 							FROM "${s.schema_name}"."payments_userassetshistory"
// 							WHERE payment_id IS NOT NULL
// 							`
//       );

// 			let paymentQueries = schemas.map(
// 				(s) => `SELECT '${s.schema_name}' AS tenant, * 
// 								FROM "${s.schema_name}"."payments_payment"
// 								`
// 				);

//       const unionQuery = queries.join(" UNION ALL ");

//       const fullQuery = `
//         SELECT * FROM (
//           ${unionQuery}
//         ) AS all_data
//         ORDER BY action_date DESC  -- 필요시 정렬 기준 조정
//         LIMIT ${limit}
//         OFFSET ${offset}
//       `;

//       const result = await db_homepage.query(fullQuery);
//       return result.rows;
  
//   } catch(error) {
//       console.log("error = ", error);
//   }
// }


// export async function findHistory2(tenant_list, page, limit) {
//   try {
//       const offset = (page - 1) * limit;

//       const { rows: schemas } = await db_homepage.query(`
//           SELECT schema_name
//           FROM information_schema.schemata
//           WHERE schema_name LIKE 'tenant_%'
//           `);
			
//       let queries = schemas.map(
//       (s) => `SELECT '${s.schema_name}' AS tenant, * 
// 							FROM "${s.schema_name}"."payments_userassetshistory"
// 							WHERE payment_id IS NOT NULL
// 							`
//       );

//       const unionQuery = queries.join(" UNION ALL ");

//       const fullQuery = `
//         SELECT * FROM (
//           ${unionQuery}
//         ) AS all_data
//         ORDER BY action_date DESC  -- 필요시 정렬 기준 조정
//         LIMIT ${limit}
//         OFFSET ${offset}
//       `;

//       const result = await db_homepage.query(fullQuery);
//       return result.rows;
  
//   } catch(error) {
//       console.log("error = ", error);
//   }
// }


export async function findPayment(tenant, payment_id) {
  try {
    const query = `
      SELECT '${tenant}' AS tenant, *
      FROM "${tenant}"."payments_payment"
      WHERE id = $1
    `;

    const result = await db_homepage.query(query, [payment_id]);
    return result.rows;

  } catch (error) {
    console.error("❌ error = ", error);
    throw error;
  }
}

// payment_id로 취소내역 찾기
export async function findCancelPayment(tenant, payment_id) {
  try {
    const query = `
      SELECT '${tenant}' AS tenant, *
      FROM "${tenant}"."payments_paymentcancellation"
      WHERE payment_id = $1
    `;

    const result = await db_homepage.query(query, [payment_id]);
    return result.rows;

  } catch (error) {
    console.error("❌ error = ", error);
    throw error;
  }
}

// cancel_id로 취소내역 찾기
export async function findCancelPaymentByCancelId(tenant, cancel_id) {
    try {
      const query = `
        SELECT '${tenant}' AS tenant, *
        FROM "${tenant}"."payments_paymentcancellation"
        WHERE id = $1
      `;
  
      const result = await db_homepage.query(query, [cancel_id]);
      return result.rows;
  
    } catch (error) {
      console.error("❌ error = ", error);
      throw error;
    }
}

// 취소신청 반려
export async function rejectCancelPaymentByCancelId(tenant, cancel_id, cancel_status) {
    try {
    // 현재 시각 (ISO 형식)
    // const ended_at = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
    const ended_at = new Date(Date.now()).toISOString();
    
    // 취소 상태와 처리 일시 업데이트
    const updateQuery = `
      UPDATE "${tenant}"."payments_paymentcancellation"
      SET cancel_status = $3,
          ended_at = $2
      WHERE id = $1
      RETURNING '${tenant}' AS tenant, *;
    `;

    const result = await db_homepage.query(updateQuery, [cancel_id, ended_at, cancel_status]);
    
    return result.rows;

    } catch (error) {
      console.error("❌ error = ", error);
      throw error;
    }
  }

export async function confirmCancelPaymentByCancelId(tenant, cancel_id, cancel_status) {
    try {
    // 현재 시각 (ISO 형식)
    // const ended_at = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
    const ended_at = new Date(Date.now()).toISOString();
    // 취소 상태와 처리 일시 업데이트
    const updateQuery = `
      UPDATE "${tenant}"."payments_paymentcancellation"
      SET cancel_status = $3,
          ended_at = $2
      WHERE id = $1
      RETURNING '${tenant}' AS tenant, *;
    `;

    const result = await db_homepage.query(updateQuery, [cancel_id, ended_at, cancel_status]);
    
    return result.rows;

    } catch (error) {
      console.error("❌ error = ", error);
      throw error;
    }
}

export async function processCancelPaymentByCancelId(tenant, cancel_id, cancel_status) {
    try {
    // 현재 시각 (ISO 형식)
    const ended_at = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
    // 취소 상태와 처리 일시 업데이트

   
    const updateQuery = `
      UPDATE "${tenant}"."payments_paymentcancellation"
      SET cancel_status = $3,
          ended_at = $2
      WHERE id = $1
      RETURNING '${tenant}' AS tenant, *;
    `;

    const result = await db_homepage.query(updateQuery, [cancel_id, ended_at, cancel_status]);
    
    return result.rows;

    } catch (error) {
      console.error("❌ error = ", error);
      throw error;
    }
}

export async function getCancelPayment(page, limit, info = {}) {
    try {
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
      let whereConditions = [];
      if (info.start_date) {
        const startDate = new Date(info.start_date).toISOString();
        whereConditions.push(`cancelled_at >= '${startDate}'`);
      }
      if (info.end_date) {
        const tempDate = new Date(info.end_date);
        tempDate.setDate(tempDate.getDate() + 1); // 하루 뒤로
        const endDate = tempDate.toISOString();
        whereConditions.push(`cancelled_at < '${endDate}'`);
      }

      // 결제 상태 조건 생성
      if (info.cancel_status !== undefined && info.cancel_status !== null && info.cancel_status !== false && info.cancel_status !== true) {
        whereConditions.push(`cancel_status = '${info.cancel_status}'`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";
  
      // 쿼리 생성
      const queries = tenantSchemas.map((s) => `
        SELECT '${s.schema_name}' AS tenant, * 
        FROM "${s.schema_name}"."payments_paymentcancellation"
        ${whereClause}
      `);
      const unionQuery = queries.join(" UNION ALL ");
  
      // 쿼리 생성
      const amountQueries = tenantSchemas.map((s) => `
        SELECT '${s.schema_name}' AS tenant, * 
        FROM "${s.schema_name}"."payments_paymentcancellation"
        WHERE cancel_status = 1 
      `);
      const amountUnionQuery = amountQueries.join(" UNION ALL ");

      // 전체 row 수 조회
      const countQuery = `
        SELECT COUNT(*) AS total_count FROM (${unionQuery}) AS all_data
      `;
      const { rows: countResult } = await db_homepage.query(countQuery);
      const totalCount = parseInt(countResult[0].total_count, 10);
  
      // 전체 환불금액 합산
      const cancelTotalAmountQuery = `
        SELECT COALESCE(SUM(refund_amount), 0) AS refund_total_amount FROM (${amountUnionQuery}) AS all_data
      `;
      const { rows: amountResult } = await db_homepage.query(cancelTotalAmountQuery);
      const refund_total_amount = Number(amountResult[0].refund_total_amount);
  
      // 페이지네이션 적용된 취소내역 조회
      const paginatedQuery = `
        SELECT * FROM (${unionQuery}) AS all_data
        ORDER BY cancelled_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
      const { rows: cancelRows } = await db_homepage.query(paginatedQuery);

      // 전체 금액 구하기 쿼리
      const queriesWithoutConditions = tenantSchemas.map((s) => {
        const schema = s.schema_name;
      
        return `
          SELECT 
            '${schema}' AS tenant, 
            p.*, 
            c.cancel_status, 
            c.refund_amount
          FROM "${schema}"."payments_payment" p
          LEFT JOIN "${schema}"."payments_paymentcancellation" c 
            ON p.id = c.payment_id
          WHERE pay_status = '승인완료'
        `;
      });
      const unionQueryWithoutConditions = queriesWithoutConditions.join(" UNION ALL ");

      // ✅ 전체 금액 합산 (조건 없는 unionQuery 사용)
      const totalAmountQuery = `
      SELECT 
        COALESCE(SUM(total_price) - SUM(COALESCE(refund_amount, 0)), 0) AS total_amount 
      FROM (${unionQueryWithoutConditions}) AS all_data
      `;
      const { rows: totalAmountResult } = await db_homepage.query(totalAmountQuery);
      const total_amount = Number(totalAmountResult[0].total_amount);
  
      return {
        totalCount,
        refund_total_amount,
        total_amount,
        cancelHistory_list: cancelRows,
      };
    } catch (error) {
      console.error("❌ error = ", error);
      throw error;
    }
  }
  

// 프로모션 페이지 회원 조회
export async function getUserList(page, limit, info = {}) {
  try {
    // 결제완료: pay_status(승인완료) / 입금대기: pay_status(입금대기) / 취소환불: cancel_status(1)
    page = Number(page) || 1;
    limit = Number(limit) || 10;
    const offset = (page - 1) * limit;

    const tenantSchemas = info.tenant_list;

    const queries = tenantSchemas.map((s) => {
        const schema = s;
        return  `
          SELECT
              '${schema}' AS tenant,
              s.id AS service_id,
              s.name AS service_name,
              COALESCE(SUM(CASE WHEN pa.type = '1' THEN 1 ELSE 0 END), 0) AS usage_count,
              COALESCE(SUM(CASE WHEN pa.type = '0' THEN 1 ELSE 0 END), 0) AS coupon_count
          FROM public.admin_panel_servicedefinition s
          LEFT JOIN public.admin_panel_pricingplan pp
              ON pp.service_id = s.id
          LEFT JOIN "${schema}"."payments_userassets" pa
              ON pa.pricing_plan_id = pp.id
              AND pa.is_used = false
          GROUP BY s.id, s.name
        `
    });
   
    const unionQuery = queries.join(" UNION ALL ");

    // 전체 row 수 조회
    const countQuery = `
      SELECT COUNT(DISTINCT tenant) AS total_count FROM (${unionQuery}) AS all_data
    `;
    const { rows: countResult } = await db_homepage.query(countQuery);
    const totalCount = parseInt(countResult[0].total_count, 10);


    // 페이지네이션 적용된 결제 내역 조회
    // const paginatedQuery = `
    //   SELECT * FROM (${unionQuery}) AS all_data
    //   LIMIT ${limit}
    //   OFFSET ${offset}
    // `;

    // const paginatedQuery = `
    //   SELECT * FROM (${unionQuery}) AS all_data
    // `;

     const paginatedQuery = `
      SELECT * FROM (${unionQuery}) AS all_data
      LIMIT ${limit * 2}
      OFFSET ${offset}
    `;
    
    const { rows: paymentRows } = await db_homepage.query(paginatedQuery);
    
    // 테넌트별로 그룹핑
    const groupedByTenant = paymentRows.reduce((acc, cur) => {
      const { tenant, ...rest } = cur;

      if (!acc[tenant]) {
        acc[tenant] = { service_list: [] };
      }

      acc[tenant].service_list.push(rest);

      return acc;
    }, {});

    tenantSchemas.forEach((schema) => {
      if (!groupedByTenant[schema]) {
        groupedByTenant[schema] = {
          service_list: [
            { service_id: "1", service_name: "AICiTi", usage_count: "0", coupon_count: "0" },
            { service_id: "2", service_name: "AImodel", usage_count: "0", coupon_count: "0" }
          ]
        };
      }
    });

    // service_id 오름차순 정렬
    Object.keys(groupedByTenant).forEach((tenant) => {
      groupedByTenant[tenant].service_list.sort(
        (a, b) => Number(a.service_id) - Number(b.service_id)
      );
    });

    // ✅ Object → Array 변환
    const paymentHistoryArray = Object.entries(groupedByTenant).map(([tenant, data]) => {
    
      return {
        tenant_name: tenant,
        service_list: data.service_list
      };
    });

  
    return {
      totalCount,
      paymentHistory_list: paymentHistoryArray
    };
  } catch (error) {
    console.error("❌ error = ", error);
    throw error;
  }
}
