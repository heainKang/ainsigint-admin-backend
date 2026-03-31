import { db_homepage } from "../config/db_homepage.js";

export async function find(info = {}) {
    // const country = await db_homepage.query(`
    //     SELECT * 
    //     FROM public.customers_country
    //     WHERE id = ${country_id};
    // `)
    let baseQuery = `SELECT * FROM public.customers_country`;
    let conditions = [];
    let values = [];
    let index = 1; // 파라미터 순서 ($1, $2, ...)

    if (info.country_id !== undefined && info.country_id !== null) {
        conditions.push(`id = $${index++}`);
        values.push(info.country_id);
    }

    if (info.country_name !== undefined && info.country_name !== null) {
        conditions.push(`name_kr ILIKE $${index++}`); // 대소문자 구분 없이 포함 검색
        values.push(`%${info.country_name}%`); // 포함 조건을 위해 % 사용
    }
   
    if (conditions.length > 0) {
        baseQuery += ` WHERE ` + conditions.join(' AND ');
    }

    const countries = await db_homepage.query(baseQuery, values);

    return countries.rows;

}
