import { db_homepage } from "../config/db_homepage.js";

export async function find(info = {}) {
    // const country = await db_homepage.query(`
    //     SELECT * 
    //     FROM public.customers_country
    //     WHERE id = ${country_id};
    // `)
    let baseQuery = `SELECT * FROM public.admin_panel_servicedefinition`;
    let conditions = [];
    let values = [];
    let index = 1; // 파라미터 순서 ($1, $2, ...)

    if (info.service_id !== undefined && info.service_id !== null) {
        conditions.push(`id = $${index++}`);
        values.push(info.service_id);
    }

    if (info.service_name !== undefined && info.service_name !== null) {
        conditions.push(`name ILIKE $${index++}`); // 대소문자 구분 없이 포함 검색
        values.push(`%${info.service_name}%`); // 포함 조건을 위해 % 사용
    }
   
    if (conditions.length > 0) {
        baseQuery += ` WHERE ` + conditions.join(' AND ');
    }

    baseQuery += ` ORDER BY id ASC`;
    const services = await db_homepage.query(baseQuery, values);

    return services.rows;

}
