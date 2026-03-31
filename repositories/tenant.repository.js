import { consoleLoggingIntegration } from "@sentry/node";
import { db_homepage } from "../config/db_homepage.js";

// 유저 여러명 찾기(조건 포함)
export async function getUserAssets(tenant, client_id) {
    try {
        // 1. 해당 유저의 tenant 조회
        const result = await db_homepage.query(`
            SELECT '${tenant}' AS tenant, ${client_id} AS client_id, *
            FROM "${tenant}"."payments_userassets" ORDER BY created_at DESC
        `);
        return result.rows

    } catch(error) {
        console.error("getUserAssets error:", error);
        return [];
    }
};


export async function getUserAssetsHistory(tenant, client_id, info, page, limit) {
    try {
        let baseQuery = `
            SELECT '${tenant}' AS tenant, ${client_id} AS client_id, *
            FROM "${tenant}"."payments_userassetshistory"
            `;
        let rowCountQuery = `SELECT COUNT(*) FROM "${tenant}"."payments_userassetshistory"`;    
        let conditions = [];
        let values = [];
        let index = 1; // 파라미터 순서 ($1, $2, ...)

        if (info.asset_type !== undefined && info.asset_type !== null) {
            if (info.asset_type !== '2' ) {
                conditions.push(`asset_type = $${index++}`);
                values.push(info.asset_type);
            }
        }

        if (Array.isArray(info.plan_list) && info.plan_list.length > 0) {
            const placeholders = info.plan_list.map(() => `$${index++}`).join(', ');
            conditions.push(`pricing_plan_id IN (${placeholders})`);
            values.push(...info.plan_list);
        }

        if (info.action_type !== undefined && info.action_type !== null) {
            conditions.push(`action_type = $${index++}`);
            values.push(info.action_type);
        }

        // 날짜 필터 조건
        const startDate = info.start_date ? new Date(info.start_date).toISOString() : null;
        const endDate = info.end_date ? new Date(info.end_date).toISOString() : null;
        if (startDate && endDate) {
                conditions.push(`action_date BETWEEN $${index} AND $${index + 1}`);
                values.push(startDate);
                values.push(endDate);
                index += 2;
            } else if (startDate) {
                conditions.push(`action_date >= $${index++}`);
                values.push(startDate);
            } else if (endDate) {
                conditions.push(`action_date <= $${index++}`);
                values.push(endDate);
            }
    
        if (conditions.length > 0) {
            baseQuery += ` WHERE ` + conditions.join(' AND ');
            rowCountQuery += ` WHERE ` + conditions.join(' AND ');
        }
   
        //  // ✅ count 쿼리 실행 (LIMIT, OFFSET 제외);
        const rowCountResult = await db_homepage.query(rowCountQuery, values);
        const totalCount = parseInt(rowCountResult.rows[0].count, 10);


        baseQuery += ` ORDER BY action_date DESC`;
        baseQuery += ` LIMIT $${index++} OFFSET $${index++}`;
        values.push(limit, (page - 1) * limit);
        const result = await db_homepage.query(baseQuery, values);

        let countQuery = `
            SELECT 
                SUM(CASE WHEN action_type = 0 THEN quantity ELSE 0 END) AS plus_quantity,
                SUM(CASE WHEN action_type = 1 THEN quantity ELSE 0 END) AS minus_quantity
            FROM "${tenant}"."payments_userassetshistory"
        `;

        if (conditions.length > 0) {
            countQuery += ` WHERE ` + conditions.join(' AND ');
        }

        // 👉 LIMIT/OFFSET 제외한 values만 추출
        const countQueryValues = values.slice(0, values.length - 2);

        const countResult = await db_homepage.query(countQuery, countQueryValues);
        
        return {countResult, totalCount, history_list: result.rows};

    } catch(error) {
        console.error("getUserAssets error:", error);
        return [];
    }
};

// 이용권 및 쿠폰 상세 조회
export async function getUserDetailAssets(tenant, client_id, info, page, limit) {
    try {
        console.log("page, limit, info == ", page, limit, info);
        let conditions = [`is_used = false`];
        let values = [];
        let index = 1;

        // if (info.type !== undefined && info.type !== null) {
        //     // conditions.push(`type = $${index++}`);
        //     // values.push(info.type);
        //     if (info.type === '1' || info.type === 1) {
        //         conditions.push(`pa.name LIKE $${index++}`);
        //         values.push(`%사용권%`);
        //     }else if (info.type === '0' || info.type === 0) {
        //         console.log("쿠폰")
        //         conditions.push(`pa.name LIKE $${index++}`);
        //         values.push(`%쿠폰%`);
        //     }
        // }

        if (info.type !== undefined && info.type !== null) {
            // conditions.push(`type = $${index++}`);
            // values.push(info.type);
            if (info.type === '1' || info.type === 1) {
                conditions.push(`type = $${index++}`);
                values.push(info.type);
            }else if (info.type === '0' || info.type === 0) {
                console.log("쿠폰")
                conditions.push(`type = $${index++}`);
                values.push(info.type);
            }
        }
        
        if (Array.isArray(info.plan_list) && info.plan_list.length > 0) {
            const placeholders = info.plan_list.map(() => `$${index++}`).join(', ');
            conditions.push(`pricing_plan_id IN (${placeholders})`);
            values.push(...info.plan_list);
        }

        // if (info.plan !== undefined && info.plan !== null) {
        //     conditions.push(`type = $${index++}`);
        //     values.push(info.type);

        //     if (info.type === '1') {
        //         conditions.push(`pa.name LIKE $${index++}`);
        //         values.push(`%1회%`);
        //     }else if (info.type === '0') {
        //         conditions.push(`pa.name LIKE $${index++}`);
        //         values.push(`%쿠폰%`);
        //     }
        // }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : "";


        // // 1. 전체 row 개수(조건 적용 후)
        // const countQuery = `
        //     SELECT COUNT(*) AS total_filtered_count
        //     FROM "${tenant}"."payments_userassets" pa
        //     ${whereClause}
        // `;

        // 그룹 총 개수 쿼리(페이징 없음)
        const countQuery = `
            SELECT COUNT(*) AS total_group_count
            FROM (
                SELECT date_trunc('second', created_at) AS created_at_group
                FROM "${tenant}"."payments_userassets" pa
                ${whereClause}
                GROUP BY date_trunc('second', created_at)
            ) t;
        `;

        const baseQuery = `
            SELECT 
                '${tenant}' AS tenant,
                ${client_id} AS client_id,
                date_trunc('second', created_at) AS created_at_group,
                ARRAY_AGG(DISTINCT pa.name ORDER BY pa.name) AS assets,  -- 이름 중복 제거
                ARRAY_AGG(DISTINCT pa.reason ORDER BY pa.reason) AS reason,  -- 이유 중복 제거
                ARRAY_AGG(DISTINCT pa.expiry_date ORDER BY pa.expiry_date) AS expiry_date,  -- 유효기간 중복 제거
                ARRAY_AGG(DISTINCT pa.pricing_plan_id ORDER BY pa.pricing_plan_id) AS pricing_plan_id,  -- pricing_plan_id 중복 제거
                COUNT(*) AS total_count  -- 해당 그룹 전체 개수
            FROM "${tenant}"."payments_userassets" pa
            ${whereClause}
            GROUP BY created_at_group
            ORDER BY created_at_group DESC
            LIMIT $${index++} OFFSET $${index++};
        `;

        // const baseQuery = `
        //     SELECT 
        //         '${tenant}' AS tenant,
        //         ${client_id} AS client_id,
        //         date_trunc('second', created_at) AS created_at_group,
        //         ARRAY_AGG(DISTINCT pa.name ORDER BY pa.name) AS assets,  -- 이름 중복 제거
        //         ARRAY_AGG(DISTINCT pa.reason ORDER BY pa.reason) AS reason,  -- 이유 중복 제거
        //         ARRAY_AGG(DISTINCT pa.expiry_date ORDER BY pa.expiry_date) AS expiry_date,  -- 유효기간 중복 제거
        //         ARRAY_AGG(DISTINCT pa.pricing_plan_id ORDER BY pa.pricing_plan_id) AS pricing_plan_id,  -- pricing_plan_id 중복 제거
        //         COUNT(*) AS total_count  -- 해당 그룹 전체 개수
        //     FROM "${tenant}"."payments_userassets" pa
        //     ${whereClause}
        //     GROUP BY created_at_group
        //     ORDER BY created_at_group DESC;
        // `;

        // 전체 그룹의 rows 조회
        // const result = await db_homepage.query(baseQuery, values);

        // values.push(limit, offset);
        // const result = await db_homepage.query(baseQuery, values);

        // // JS에서 limit/offset으로 슬라이싱
        // const offset = (page - 1) * limit;

        // console.log("offset, limit == ", offset, limit);
        // const pagedRows = result.rows.slice(offset, offset + limit);

        // values.push(limit, (page - 1) * limit);

        // 각각 쿼리 수행
        // const totalResult = await db_homepage.query(countQuery, values.slice(0, values.length - 2)); // limit, offset 제외
        // const result = await db_homepage.query(baseQuery, values);

         // offset 계산
         const offset = (page - 1) * limit;

         // values에 limit/offset 추가
         const queryValues = [...values, limit, offset];
 
         // 각각 쿼리 수행
         const totalResult = await db_homepage.query(countQuery, values); // count에는 limit/offset 필요 없음
         const result = await db_homepage.query(baseQuery, queryValues);

        return {total_rows_count: totalResult.rows[0]?.total_group_count || 0, result: result.rows};
    } catch (error) {
        console.error("getUserAssets error:", error);
        return [];
    }
};