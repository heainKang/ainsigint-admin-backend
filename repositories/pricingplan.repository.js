import { db_homepage } from "../config/db_homepage.js";

export async function find(info = {}) {
    // const country = await db_homepage.query(`
    //     SELECT * 
    //     FROM public.customers_country
    //     WHERE id = ${country_id};
    // `)
    let baseQuery = `SELECT * FROM public.admin_panel_pricingplan`;
    let conditions = [];
    let values = [];
    let index = 1; // 파라미터 순서 ($1, $2, ...)

    if (info.plan_id !== undefined && info.plan_id !== null) {
        conditions.push(`id = $${index++}`);
        values.push(info.plan_id);
    }

    if (info.service_id !== undefined && info.service_id !== null) {
        conditions.push(`service_id = $${index++}`);
        values.push(info.service_id);
    }

    if (info.plan_name !== undefined && info.plan_name !== null) {
        conditions.push(`name ILIKE $${index++}`); // 대소문자 구분 없이 포함 검색
        values.push(`%${info.plan_name}%`); // 포함 조건을 위해 % 사용
    }
   
    if (conditions.length > 0) {
        baseQuery += ` WHERE ` + conditions.join(' AND ');
    }

    const plans = await db_homepage.query(baseQuery, values);

    return plans.rows;

}
