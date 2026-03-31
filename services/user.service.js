import * as userRepo from '../repositories/user.repository.js';
import * as countryRepo from '../repositories/country.repository.js';
import * as tenantRepo from '../repositories/tenant.repository.js';
import * as serviceRepo from '../repositories/service.repository.js';
import * as pricingplanRepo from '../repositories/pricingplan.repository.js';
import * as paymentRepo from '../repositories/payment.repository.js';
import { generateTempPassword } from '../utils/temp_password.js';

import { resetUserPasswordHtml } from '../utils/email_template.js';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';


// 메일 전송
import nodemailer from 'nodemailer';
import { countReset, info } from 'console';


// 모든 유저 정보 조회
export async function getAllUsers(page, limit) {
    const users = await userRepo.find({}, page, limit, is_staff = 'true');
    const filteredUsers = await Promise.all(
        users.client_list.map(async (user, i) => {
            const country = await countryRepo.find(user.country_id);

            return {
                num: (page - 1) * limit + (i + 1),
                idx: user.id,
                signup_date: user.created_at,
                nick_name: user.nickname,
                dental_name: user.dental_name,
                country: country.name_kr,
                is_active: user.is_active,
                is_staff: user.is_staff,
                last_login_date: user.last_login
            };
        })
    );

    return {total_count: users.totalCount, client_list: filteredUsers};
}

// 유저 상세 정보 조회
export async function getUser(user_id) {
    const user = await userRepo.findOne(Number(user_id));
    const country = await countryRepo.find({country_id: user.country_id});
    
    const birthDate = user?.birth;
    const formattedDate = birthDate
    ? `${birthDate.slice(0, 4)}-${birthDate.slice(4, 6)}-${birthDate.slice(6, 8)}`
    : null;

    const contact = user?.phone;
    const formattedContact = contact
    ? contact.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
    : null;
    const signup_date = new Date(user.created_at).toISOString('ko-KR')
    return {
        basic_info : {
            idx: user.id,
            nick_name: user.nickname,
            email: user.email,
            name: user.full_name,
            birth_date: formattedDate,
            contact: formattedContact,
            country_id: country[0].id,
            country: country[0].name_kr,
            address_1: user.address1,
            address_2: user.address2
        },
        dental_info : {
            dental_name: user.dental_name,
            CBCT_name: user.cbct_name,
            dental_address_1: user.dental_address1,
            dental_address_2: user.dental_address2,
            doctor_type: user.doctor_type, // 0: 일반의, 1: 교정의, 2: 기타
            open_status: user.open_status, // 0: 개원완료, 1: 개원예줭, 2: 기타
            business_registry_number: user.business_registry_number
        },
        active_info : {
            is_active: user.is_active, // true: 활성화, false : 탈퇴
            // signup_date : user.created_at,
            signup_date : signup_date,
            last_login_date: user.last_login,
            withdrawal_at: user.withdrawal_at,
            withdrawal_reason_text: user.withdrawal_reason_text
        },
        allow_marketing: user.allow_marketing, // false: 미동의, true: 동의
        is_staff: user.is_staff     
    };    
}

export async function getAllQuestions() {
    const questions = userRepo.getAllQuestions();

    return questions;
}

// 모든 나라 조회
export async function getAllCountry(info) {
    const countries = await countryRepo.find(info);
    const filteredCountries = await Promise.all(
        countries.map(async (country) => {
            return {
                id: country.id,
                name_kr: country.name_kr
            };
        })
    );

    return countries;
}

// 유저 찾기
export async function findUser(info, page, limit) {
    console.log("info == ", info);
    const users = await userRepo.find(info, page, limit);

    const filteredUsers = await Promise.all(
        users.client_list.map(async (user, i) => {
            const countryInfo = {
                country_id: user.country_id
            }
            const country = await countryRepo.find(countryInfo);
            return {
                num: (page - 1) * limit + (i + 1),
                idx: user.id,
                signup_date: user.created_at,
                nick_name: user.nickname,
                dental_name: user.dental_name,
                country: country[0].name_kr,
                is_active: user.is_active,
                last_login_date: user.last_login
            };
        })
    );

    let finalUsers = filteredUsers;    

    return {total_count: users.totalCount, client_list: finalUsers};
}


// 유저의 이용권 정보 조회(이용권 정보 버튼 클릭)
export async function getUserTicket(user_id) {
    const { ticket_info, AI_info } = await getTicketInfo(user_id);

    console.log("ticket_info == ", ticket_info);
    console.log("ai info == ", AI_info);
    return {ticket_info, AI_info};
    
};



// 이용권, 쿠폰 개수 정보 조회
export async function getTicketInfo(user_id) {
    // 유저 정보 찾기
    const user = await userRepo.findOne(user_id);
    const tenant_name = user.schema_name;
    const client_id = user.id;

    // 유저에 대한 userassets 찾기
    const payment_userassets = await tenantRepo.getUserAssets(tenant_name, client_id);

    // 유저에 대한 userassetshistory 찾기
    // 유저에 대한 payment_cancellation 찾기
    
    const services = await serviceRepo.find({});
    const serviceTicketData = {};
    for (const service of services) {
        const name = service.name;
        serviceTicketData[name] = {
            ticket_count: 0,
            coupon_count: 0,
            used_ticket_count: 0,
            used_coupon_count: 0,
            total_count: 0
        };
    }

    for (const asset of payment_userassets) {
        const type = Number(asset.type);
        const reason = asset.reason?.trim();
        const notIsUsed = asset.is_used === false || asset.is_used === 'false';
        const isUsed = asset.is_used === true || asset.is_used === 'true';
        const plan_id = asset.pricing_plan_id;

        const pricingPlan = await pricingplanRepo.find({ plan_id: plan_id });
        
       
        //const service = await serviceRepo.find({ service_id: pricingPlan[0].service_id });
        const service = await serviceRepo.find({ service_id: pricingPlan[0].service_id });
        if (!service || service.length === 0) continue;


        const serviceName = service[0].name;

        // ✅ 안전하게 존재 여부 확인
        if (!serviceTicketData[serviceName]) continue;

        // 해당 서비스 이름이 없으면 초기화
        if (!serviceTicketData[serviceName]) {
            serviceTicketData[serviceName] = {
                ticket_count: 0,
                coupon_count: 0,
                used_ticket_count: 0,
                used_coupon_count: 0
            };
        }

        if (serviceName === 'AICiTi') {
            if (type === 1 && notIsUsed) {
                serviceTicketData[serviceName].ticket_count += 1;
            } else if (type === 1 && isUsed) {
                serviceTicketData[serviceName].used_ticket_count += 1;
            } else if (type === 0 && notIsUsed) {
                serviceTicketData[serviceName].coupon_count += 1;
            } else if (type === 0 && isUsed) {
                serviceTicketData[serviceName].used_coupon_count += 1;
            } 
        } else {
            if (type === 1 && reason === '구매' && isUsed && plan_id === 7) {
                serviceTicketData[serviceName].ticket_count += 1;
            } else {
                serviceTicketData[serviceName].coupon_count += 1;
            }
        }       
    }

    // 전체 합계도 구할 수 있음
    // let total_ticket_count = 0;
    // let total_coupon_count = 0;

    for (const service in serviceTicketData) {
        const ticket = serviceTicketData[service].ticket_count;
        const coupon = serviceTicketData[service].coupon_count;
        serviceTicketData[service].total_count = ticket + coupon;
    
        // total_ticket_count += ticket;
        // total_coupon_count += coupon;
    }

    // serviceTicketData 객체를 배열로 변환
    const serviceListArray = Object.entries(serviceTicketData).map(([serviceName, data]) => ({
        [serviceName]: data
    }));

    return {
        ticket_info: {
            idx: user.id,
            dental_name: user.dental_name,
            email: user.email
        },
        AI_info: {
            service_list: serviceListArray // AIciti, AImodel 별로 정리된 정보
            // total_ticket_count,
            // total_coupon_count
        }
    }
};

// 이용권 상세 내역 조회
export async function getUserTicketDetail(user_id, page, limit, info) {
    const user = await userRepo.findOne(user_id);
    const tenant_name = user.schema_name;
    const client_id = user.id;

    const pricingPlans = await pricingplanRepo.find({ service_id: info.service_id });
    const plan_list = [];

    for (const row of pricingPlans) {
        plan_list.push(Number(row.id));
    }

    const payments_userassethistory = await tenantRepo.getUserDetailAssets(
        tenant_name, client_id, {type: '1', plan_list: plan_list}, page, limit
    );

    console.log("payments_history == ", payments_userassethistory);

    const filteredHistory = await Promise.all(
        payments_userassethistory.map(async (history, i) => {
            const plan_id = history.pricing_plan_id[0];
            const pricingPlan = await pricingplanRepo.find({ plan_id: plan_id });
            const service = await serviceRepo.find({ service_id: pricingPlan[0].service_id });
            const planName = pricingPlan[0].name;        

            return {
                idx: (page - 1) * limit + (i + 1),
                action_date: history.created_at_group,
                asset_type_name: planName, // 이용권 명
                given_reason: history.reason[0],
                plus_quantity: history.total_count,
                expiry_date: (history.expiry_date[0]).toISOString().split('T')[0]
               
                // expiry_date: expiryDate.toISOString().split('T')[0]
            };
            
        })
    );

    let finalHistory = filteredHistory;
    return {ticket_history_list: finalHistory};
};

// 쿠폰 상세 내역 조회
export async function getUserCouponDetail(user_id, page, limit, info) {
    const user = await userRepo.findOne(user_id);
    const tenant_name = user.schema_name;
    const client_id = user.id;

    const pricingPlans = await pricingplanRepo.find({ service_id: info.service_id });
    const plan_list = [];

    for (const row of pricingPlans) {
        plan_list.push(Number(row.id));
    }

    const payments_userassethistory = await tenantRepo.getUserDetailAssets(
        tenant_name, client_id, {type: '0', plan_list: plan_list}, page, limit
    );

    // const payments_userassethistory = await tenantRepo.getUserDetailAssets(
    //     tenant_name, client_id, {type: '0'}, page, limit
    // );

    console.log("payments_history == ", payments_userassethistory);

    const filteredHistory = await Promise.all(
        payments_userassethistory.map(async (history, i) => {
            const plan_id = history.pricing_plan_id[0];
            const pricingPlan = await pricingplanRepo.find({ plan_id: plan_id });
            const service = await serviceRepo.find({ service_id: pricingPlan[0].service_id });
            const planName = pricingPlan[0].name;        

            return {
                idx: (page - 1) * limit + (i + 1),
                action_date: history.created_at_group,
                asset_type_name: planName, // 이용권 명
                given_reason: history.reason[0],
                plus_quantity: history.total_count,
                expiry_date: (history.expiry_date[0]).toISOString().split('T')[0]
               
                // expiry_date: expiryDate.toISOString().split('T')[0]
            };
            
        })
    );

    let finalHistory = filteredHistory;
    return {ticket_history_list: finalHistory};
};


// 이용권 및 쿠폰 상세 내역 조회
export async function getUserAssetsDetail(user_id, page, limit, info) {
    console.log("page, limit, info == ", page, limit, info);
    
    // 유저 찾기
    const user = await userRepo.findOne(user_id);
    const tenant_name = user.schema_name;
    const client_id = user.id;

    // 이용권인지, 쿠폰인지해서 pricingPlans들 찾기
    const pricingPlans = await pricingplanRepo.find({ service_id: info.service_id });
    const plan_list = [];

    for (const row of pricingPlans) {
        plan_list.push(Number(row.id));
    }

    const payments_userassethistory = await tenantRepo.getUserDetailAssets(
        tenant_name, client_id, {type: info.type, plan_list: plan_list}, page, limit
    );

    // const payments_userassethistory = await tenantRepo.getUserDetailAssets(
    //     tenant_name, client_id, {type: '0'}, page, limit
    // );

    const filteredHistory = await Promise.all(
        payments_userassethistory.result.map(async (history, i) => {
            const plan_id = history.pricing_plan_id[0];
            const pricingPlan = await pricingplanRepo.find({ plan_id: plan_id });
            const service = await serviceRepo.find({ service_id: pricingPlan[0].service_id });
            const planName = pricingPlan[0].name;        

            return {
                idx: (page - 1) * limit + (i + 1),
                action_date: history.created_at_group,
                asset_type_name: planName, // 이용권 명
                given_reason: history.reason[0],
                plus_quantity: history.total_count,
                expiry_date: (history.expiry_date[0]).toISOString().split('T')[0]
               
                // expiry_date: expiryDate.toISOString().split('T')[0]
            };
            
        })
    );

    let finalHistory = filteredHistory;

    console.log(`total_history_count: ${payments_userassethistory.total_rows_count},  ticket_history_list: ${finalHistory}`)
    
    return {total_history_count: payments_userassethistory.total_rows_count, ticket_history_list: finalHistory};
};





// 비밀번호 초기화
export async function resetPassword(user_id) {

    try {
        const user = await userRepo.findOne(user_id);
        
        if (!user) {
            return { status: "fail", message: "유저 찾기 못함." };
        }
    
        // ✅ 보안성 높은 랜덤 비밀번호 생성
        // const authString = crypto.randomBytes(4).toString('hex'); // 8자리
        // const hashedPassword = await bcrypt.hash(authString, 10);
    
        const authString = generateTempPassword();
        console.log('임시 비밀번호:', authString);

        const hashedPassword = await bcrypt.hash(authString, 10);
        console.log('해시된 비밀번호:', hashedPassword);
    
         // ✅ 메일 전송 준비
        const smtpTransport = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            }
        });
    
        const mailOptions = {
            from: process.env.SMTP_USER, // 발송 주체
            to: user.email, // 인증을 요청한 이메일 주소
            subject: '[아인사이트] 임시 비밀번호 발급 안내',
            html: resetUserPasswordHtml(authString)
        };
    
        // ✅ SMTP 연결 확인
        await smtpTransport.verify();    
        // ✅ 메일 발송
        await smtpTransport.sendMail(mailOptions);
        smtpTransport.close();
        console.log("메일 보내기 성공");

        // ✅ 메일 발송 성공 후 DB 업데이트
        await userRepo.resetPassword(user_id, hashedPassword);
        
        return { status: "success", message: "비밀번호 초기화 성공"};
  
    } catch(error) {
        console.log("** service error == ", error);
        return { status: 'error', message: '비밀번호 초기화 실패', error: error.message };
    }
};


// 유저 정보 업데이트
export async function updateUserInfo(user_id, info) {
    try {
        // const reqinfo = {};

        console.log("info1 == ", info);

        // // 1. 날짜 변환
        // if (info.birth_date) {
        //     reqinfo.birth = info.birth_date.replace(/-/g, "");
        // }

        // if (info.country) {
        //     // const country = await countryRepo.find({country_name: info.country});
        //     const country = await countryRepo.find({country_id: info.country_id});
        //     if (country[0] && country[0].id) {
        //         console.log("country == ", country[0].id);
        //         reqinfo.country_id = country[0].id;
        //     }
        // }

         // 1. 날짜 변환 (info.birth_date가 존재하고, null 또는 빈 문자열이 아닌 경우)
        //  if (info.birth_date && info.birth_date !== "") {
        //     reqinfo.birth = info.birth_date.replace(/-/g, "");
        // }

        // // 2. 국가 정보 처리 (info.country_id가 존재하고, null 또는 빈 문자열이 아닌 경우)
        // if (info.country && info.country_id && info.country_id !== "") {
        //     // 예전: const country = await countryRepo.find({country_name: info.country});
        //     const country = await countryRepo.find({ country_id: info.country_id });
        //     if (country[0] && country[0].id) {        
        //         reqinfo.country_id = country[0].id;
        //     }
        // }
        
       
        // // 3. 나머지 키 매핑 테이블 정의
        // const fieldMap = {
        //     email: "email",
        //     name: "full_name",
        //     contact: "phone",
        //     address_1: "address1",
        //     address_2: "address2",
        //     dental_name: "dental_name",
        //     CBCT_name: "cbct_name",
        //     dental_address_1: "dental_address1",
        //     dental_address_2: "dental_address2",
        //     doctor_type: "doctor_type",
        //     open_status: "open_status",
        //     business_registry_number: "business_registry_number",
        //     is_active: "is_active",
        //     allow_marketing: "allow_marketing"
        // };

        // // 4. 매핑된 키만 조건부로 reqinfo에 추가 (null이나 빈 문자열이 아닐 경우)
        // for (const [key, mappedKey] of Object.entries(fieldMap)) {
        //     console.log("key, mappedKey == ", key, mappedKey);
        //     if (info[key] !== undefined && info[key] !== null && info[key] !== "") {
        //         reqinfo[mappedKey] = info[key];
        //     }
        // }

        // const user = await userRepo.findOne(Number(user_id));

        const reqinfo = {
            email: info.email,
            full_name: info.name,
            phone: info.contact,
            address1: info.address_1,
            address2: info.address_2,
            dental_name: info.dental_name,
            cbct_name: info.CBCT_name,
            dental_address1: info.dental_address_1,
            dental_address2: info.dental_address_2,
            doctor_type: info.doctor_type,
            open_status: info.open_status,
            business_registry_number: info.business_registry_number,
            is_active: info.is_active,
            allow_marketing: info.allow_marketing,
            is_staff: info.is_staff
        }

        if (info.birth_date && info.birth_date !== "") {
            reqinfo.birth = info.birth_date.replace(/-/g, "");
        }

        console.log ("reqinfo == ", reqinfo);

        // 2. 국가 정보 처리 (info.country_id가 존재하고, null 또는 빈 문자열이 아닌 경우)
        if (info.country && info.country_id && info.country_id !== "") {
            // 예전: const country = await countryRepo.find({country_name: info.country});
            const country = await countryRepo.find({ country_id: info.country_id });
            if (country[0] && country[0].id) {        
                reqinfo.country_id = country[0].id;
            }
        }

        const updateUser = await userRepo.updateUserInfo(Number(user_id), reqinfo);

        console.log("update user= ", updateUser);

        return { status: "success", message: "정보 수정 성공"};

    } catch {error} {
        console.log("** service error == ", error);
        // return { status: 'error', message: '정보 수정 실패', error: error.message };
    }    
}

// 이용권+쿠폰 내역 조회
export async function getUserTicketHistory(user_id, page, limit, info) {
    // 서비스에 관련된 pricingPlan 찾기
    const pricingPlans = await pricingplanRepo.find({ service_id: info.service_id }); 
    const plan_list = pricingPlans.map(row => row.id);
    
    // 정보를 보려는 유저 찾기
    const user = await userRepo.findOne(user_id); 
    const tenant_name = user.schema_name;
    const client_id = user.id;

    // info에 plan_list 넣기
    info.plan_list = plan_list;

    // userassetshistory 얻기
    const payments_userassethistory = await tenantRepo.getUserAssetsHistory(tenant_name, client_id, info, page, limit);
    
    // 이용권 및 쿠폰 내역 수 얻기
    const countResult = payments_userassethistory.countResult.rows[0];
    const total_row_count = Number(payments_userassethistory.totalCount); // 총 내역수
    const total_plus_quantity = Number(countResult.plus_quantity); // 지급 합계
    const total_minus_quantity = Number(countResult.minus_quantity); // 차감 합계

    // 이용권 및 쿠폰 이력 정제하기
    const filteredHistory = await Promise.all(
        payments_userassethistory.history_list.map(async (history, i) => {
            const plan_id = history.pricing_plan_id;

            const pricingPlan = await pricingplanRepo.find({ plan_id: plan_id });
            const planName = pricingPlan[0].name;
            const isGiven = history.action_type === 0;
            return {
                idx: (page - 1) * limit + (i + 1),
                action_date: history.action_date,
                asset_type: Number(history.asset_type),
                asset_type_name: planName,
                action_type: history.action_type, // 0: 지급받음, 1: 사용 및 차감
                given_reason: isGiven ? history.asset_info : '-', // 지급사유
                plus_quantity: isGiven ? history.quantity : '-',
                minus_quantity: !isGiven ? history.quantity : '-'
            };
        })
    );

    let finalHistory = filteredHistory;

    if (info.asset_type) {
        if (info.asset_type === 1 || info.asset_type === '1') {
            finalHistory = filteredHistory.filter(history => history.asset_type === 1);
        } else if (info.asset_type === 0 || info.asset_type === '0') {
            finalHistory = filteredHistory.filter(history => history.asset_type !== 1);
        } else if (info.asset_type === 2 || info.asset_type === '2') {
            finalHistory = filteredHistory;
        }
    }
    return {total_row_count: total_row_count, total_plus_quantity, total_minus_quantity, history_list: finalHistory};
};


// 쿠폰 지급할 회원 조회 in 프로모션 페이지
export async function getUserList(page, limit, info) {
    // 조건에 부합하는 유저 찾기
    let users;
    if (info !== undefined && info!== null) {
        users = await userRepo.find(info);
      } else {
        users = await userRepo.find({});
    }

    // tenant_list 조합
    let tenant_list = [];
    if (users && Array.isArray(users.client_list) && users.client_list.length > 0) {
      tenant_list = await Promise.all(
        users.client_list.map(async user => user.schema_name)
      );
    }

    // 만약 tenant_list가 비어있으면 바로 빈 결과 반환
    if (tenant_list.length === 0) {
      return {
        total_count: 0,
        cancelHistory_list: []
      };
    }

    // info에 tenant_list 넣기
    info.tenant_list = tenant_list;

    // pgae, limit 걸어서 유저 숫자 제한하고, 원하는 데이터 얻기
    const lists = await paymentRepo.getUserList(page, limit, info);

    // 얻어낸 데이터 정제하기
    const filteredUsers = await Promise.all(
        lists.paymentHistory_list.map(async (user, i) => {
            const tenant_name = user.tenant_name;
            const user_info = await userRepo.findOneBySchema(tenant_name);
            const country = await countryRepo.find({country_id :user_info.country_id});

            return {
                num: (page - 1) * limit + (i + 1),
                idx: user_info.id,
                signup_date: user_info.created_at,
                nick_name: user_info.nickname,
                full_name: user_info.full_name,
                dental_name: user_info.dental_name,
                country_id: country[0].id,
                country: country[0].name_kr,                
                service_list: user.service_list
            };
        })
    );

    // 검색된 회원수와 리스트 반환
    return {total_count: lists.totalCount, client_list: filteredUsers};
}