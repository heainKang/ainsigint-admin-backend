import { db_homepage } from "../config/db_homepage.js";

// 유저 여러명 찾기(조건 포함)
export async function find(info = {}, page, limit) {
    let baseQuery = `SELECT * FROM public.customers_client`;
    let countQuery = `SELECT COUNT(*) FROM public.customers_client`;
    let conditions = [];
    let values = [];
    let index = 1; // 파라미터 순서 ($1, $2, ...)

    // 유저 인덱스
    if (info.user_id !== undefined && info.user_id !== null) {
        conditions.push(`id = $${index++}`);
        values.push(Number(info.user_id));
    }

    // 유저 아이디(이메일계정)
    if (info.nick_name !== undefined && info.nick_name !== null) {
        conditions.push(`nickname ILIKE $${index++}`); // 대소문자 구분 없이 포함 검색
        values.push(`%${info.nick_name}%`); // 포함 조건을 위해 % 사용
    }

    // 유저 이름
    if (info.full_name !== undefined && info.full_name !== null) {
        conditions.push(`full_name ILIKE $${index++}`); // 대소문자 구분 없이 포함 검색
        values.push(`%${info.full_name}%`); // 포함 조건을 위해 % 사용
    }

    // 치과명
    if (info.dental_name !== undefined && info.dental_name !== null) {
        conditions.push(`dental_name ILIKE $${index++}`);
        values.push(`%${info.dental_name}%`);
    }

    // 국가
    if (info.country !== undefined && info.country !== null) {
        conditions.push(`country_id = $${index++}`);
        values.push(info.country);
    }
    
    // Domestic
    if (info.domestic !== undefined && info.domestic !== null) {
        if (info.domestic === 1 || info.domestic === '1') {
            console.log("국내");
            conditions.push(`country_id = 31`);
        } else if (info.domestic === 0 || info.domestic === '0') {
            console.log("국외")
            conditions.push(`country_id != 31`);
        }
    }

    // in_active
    if (info.is_active !== undefined && info.is_active !== null) {
        if (info.is_active === 1 || info.is_active === '1') {
            conditions.push(`is_active = 'true'`);
        } else if (info.is_active === 0 || info.is_active === '0') { 
            conditions.push(`is_active = 'false'`);
        }
    }

    // ✅ is_staff (선택적)
    if (info.is_staff !== undefined && info.is_staff !== null) {
        conditions.push(`is_staff = $${index++}`);
        values.push(info.is_staff);
    }

   // 날짜 필터 조건
   const startDate = info.start_date ? new Date(info.start_date).toISOString() : null;
   const endDate = info.end_date ? new Date(info.end_date).toISOString() : null;
   if (startDate && endDate) {
        conditions.push(`created_on BETWEEN $${index} AND $${index + 1}`);
        values.push(startDate);
        values.push(endDate);
        index += 2;
    } else if (startDate) {
        conditions.push(`created_on >= $${index++}`);
        values.push(startDate);
    } else if (endDate) {
        conditions.push(`created_on <= $${index++}`);
        values.push(endDate);
    }

    if (conditions.length > 0) {
        baseQuery += ` WHERE ` + conditions.join(' AND ');
        countQuery += ` WHERE ` + conditions.join(' AND ');
    }

    // 정렬 조건 추가 (최신순)
    baseQuery += ` ORDER BY created_at DESC`;
    
    // ✅ count 쿼리 실행 (LIMIT, OFFSET 제외);
    const countResult = await db_homepage.query(countQuery, values);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // baseQuery += ` LIMIT $${index++} OFFSET $${index++}`;
    // values.push(limit, (page - 1) * limit);

    if (limit && page) {
        baseQuery += ` LIMIT $${index++} OFFSET $${index++}`;
        values.push(limit, (page - 1) * limit);
    }
    const users = await db_homepage.query(baseQuery, values);
    return {
        totalCount,
        client_list: users.rows
    };
}

// 유저 한명만 찾기
export async function findOne(user_id) {
    const user = await db_homepage.query(`
        SELECT * 
        FROM public.customers_client
        WHERE id = ${user_id};
    `)

    return user.rows[0];
}

// 유저 한명만 찾기
export async function findOneBySchema(tenant_name) {
    const user = await db_homepage.query(`
        SELECT * 
        FROM public.customers_client
        WHERE schema_name = '${tenant_name}'
    `)

    return user.rows[0];
}

// 유저 비밀번호 초기화
export async function resetPassword(user_id, hashedPassword) {
    // 비밀번호 업데이트
    await db_homepage.query(`
        UPDATE public.customers_client
        SET password = $1
        WHERE id = $2;
    `, [hashedPassword, user_id]);

    console.log("비밀번호 수정 완료");
}

// 유저 정보 업데이트
export async function updateUserInfo(user_id, info) {
    const fields = [];
    const values = [];
    let index = 1;

    console.log("info == ", info);
    for (const key in info) {
        if (info[key] !== undefined) {
            fields.push(`"${key}" = $${index++}`);
            values.push(info[key]);
        }
    }

    if (fields.length === 0) {
        return { status: "fail", message: "업데이트할 정보가 없습니다." };
    }

    values.push(user_id); // 마지막 $n은 user_id


    console.log("field, value == ", fields, values);
    const query = `
        UPDATE public.customers_client
        SET ${fields.join(', ')}
        WHERE id = $${index};
    `;

    try {
        await db_homepage.query(query, values);
        return { status: "success", message: "유저 정보 업데이트 완료" };
    } catch (error) {
        console.error("유저 정보 업데이트 실패:", error);
        return { status: "fail", message: "업데이트 중 오류 발생" };
    }
}



export async function getAllQuestions() {
    try {
        const { rows: schemas } = await db_homepage.query(`
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name LIKE 'tenant_%'
            `);

        let queries = schemas.map(
        (s) => `SELECT '${s.schema_name}' AS tenant, * FROM "${s.schema_name}"."questions_userquestion"`
        );

        const fullQuery = queries.join(" UNION ALL ");
        const result = await db_homepage.query(fullQuery);

        return result.rows;
    
    } catch(error) {
        console.log("error = ", error);
    }
}