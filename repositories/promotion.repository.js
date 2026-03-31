import { db_admin } from "../config/db_admin.js";
import { db_homepage } from "../config/db_homepage.js";
import { AppDataSource_admin } from "../config/data-sources_admin.js";
import { admin } from '../models/admin.entity.js';
import { service_coupon } from '../models/service_coupon.entity.js';
import { coupon_plan_mapping } from "../models/coupon_plan_mapping.entity.js";
import { coupon_user_mapping } from "../models/coupon_user_mapping.entity.js";
import * as userRepo from '../repositories/user.repository.js';
import { addDays } from '../utils/date.js';
import * as serviceRepo from '../repositories/service.repository.js';
import * as pricingplanRepo from '../repositories/pricingplan.repository.js';
import * as countryRepo from '../repositories/country.repository.js';
import { In } from "typeorm";
import { Between } from "typeorm";

import bcrypt from 'bcrypt';
const serviceCouponRepository = AppDataSource_admin.getRepository(service_coupon);
const couponPlanMappingRepository = AppDataSource_admin.getRepository(coupon_plan_mapping);
const couponUserMappingRepository = AppDataSource_admin.getRepository(coupon_user_mapping);

// 서비스쿠폰 생성
export async function createCoupon(info) {
    try {
        const { duration } = info;
        console.log("duration == ", duration);
        
        const newCoupon = serviceCouponRepository.create({
            name: '서비스쿠폰',
            duration: Number(duration)
        });
        const coupon = await serviceCouponRepository.save(newCoupon);
    
        return coupon;    
    } catch(error) {
        console.log("error = ", error);
    }
}

// 서비스쿠폰 생성
export async function couponPlanMapping(coupon_id, info) {
    try {
        const { plan_list } = info;
        console.log("plan_list == ", plan_list);
        
        for (const row of plan_list) {
            const newCouponPlanMapping = couponPlanMappingRepository.create({
                coupon_id: coupon_id,
                pricing_plan_id: row.plan_id,
                count: row.count
            });

            await couponPlanMappingRepository.save(newCouponPlanMapping);
        }
        
        const cpm = await couponPlanMappingRepository.find({where : {coupon_id: coupon_id}});

        return cpm;    
    } catch(error) {
        console.log("error = ", error);
    }
}

// 서비스쿠폰 생성
export async function couponUserMapping(coupon_id, info) {
    try {
        const { user_list } = info;
        
        for (const i of user_list) {
            const newCouponUserMapping = couponUserMappingRepository.create({
                coupon_id: coupon_id,
                user_id: i
            });

            await couponUserMappingRepository.save(newCouponUserMapping);
        }
        
        const cum = await couponUserMappingRepository.find({where : {coupon_id: coupon_id}});

        return cum;    
    } catch(error) {
        console.log("error = ", error);
    }
}

// 유저에게 쿠폰 지급
export async function giveCoupon(info) {
    try {
        const { user_list, plan_list, duration } = info;

        const actionDate = new Date(); // 한 번만 생성
        const expiryDate = addDays(duration); // 한 번만 계산

        const results = []; // 👉 실행 결과 저장

        for (const userId of user_list) {
            const user = await userRepo.findOne(userId);
            const tenant_name = user.schema_name;
            console.log(tenant_name);

            for (const p of plan_list) {
                console.log("p=", p);
                const historyQuery = `
                    INSERT INTO "${tenant_name}"."payments_userassetshistory" 
                    (asset_type, action_type, quantity, asset_info, total_price, unit_price, pricing_plan_id, action_date)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING *
                `;

                // ✅ values는 배열이어야 함
                const historyValues = [
                    0,                  // asset_type
                    0,                  // action_type
                    p.count,            // quantity
                    '서비스쿠폰 증정',   // asset_info
                    0,                  // total_price
                    0,                  // unit_price
                    p.plan_id,          // pricing_plan_id
                    actionDate          // ✅ 오늘 날짜 (자동으로 timestamp 변환됨)
                ];

                const historyRes = await db_homepage.query(historyQuery, historyValues);
                
                const assetsQuery = `
                    INSERT INTO "${tenant_name}"."payments_userassets" 
                    (type, name, reason, benefit_code, is_used, expiry_date, created_at, updated_at, pricing_plan_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *
                `;

                // ✅ values는 배열이어야 함
                const assetsValues = [
                    0,                             // type
                    '서비스쿠폰',                  // name
                    '관리자증정',                  // reason
                    ' ',                           // benefit_code
                    false,                         // is_used
                    expiryDate,                    // expiry_date
                    actionDate,
                    actionDate,
                    p.plan_id                     // pricing_plan_id
                ];

                const assetsRes = await db_homepage.query(assetsQuery, assetsValues);


                console.log("history = ", historyRes.rows[0]);
                console.log("assets = ", assetsRes.rows[0]);
                // 👉 결과 배열에 push
                results.push({
                    user_id: userId,
                    plan_id: p.plan_id,
                    history: historyRes.rows[0],
                    asset: assetsRes.rows[0]
                });
            }
        }

        return results; // ✅ 모든 실행 결과 반환
    } catch(error) {
        console.log("error = ", error);
    }
}

// 유저에게 쿠폰지급 알림
export async function sendAlarm(info) {
    try {
        const { user_list } = info;
       
        const actionDate = new Date(); // 한 번만 생성

        const results = []; // 👉 실행 결과 저장
       
        for (const userId of user_list) {
            const user = await userRepo.findOne(userId);
            const tenant_name = user.schema_name;

            const alarmQuery = `
                    INSERT INTO "${tenant_name}"."notification_notification" 
                    (contents, read, created_at, deleted)
                    VALUES ($1, $2, $3, $4)
                    RETURNING *
                `;

                // ✅ values는 배열이어야 함
            const alarmValues = [
               '서비스 쿠폰이 지급되었습니다.',
               false,
               actionDate,
               false
            ];

            const notificationRes = await db_homepage.query(alarmQuery, alarmValues);

            console.log("notify =", notificationRes.rows[0]);

            // 👉 결과 배열에 push
            results.push({
                user_id: userId,
                notification: notificationRes.rows[0]
            });
        }

        return results; // ✅ 모든 실행 결과 반환
    } catch(error) {
        console.log("error = ", error);
    }
}

// 쿠폰 리스트 조회
export async function couponList(info) {
    try {
        // const { user_list } = info;
        const { user_list, coupon_start_date, coupon_end_date } = info;
        const couponSet = new Set();

        // coupon_end_date 하루 추가
        let adjustedEndDate = null;
        if (coupon_end_date) {
            adjustedEndDate = new Date(coupon_end_date);
            adjustedEndDate.setDate(adjustedEndDate.getDate() + 1); // 하루 더하기
        }

        for (const userId of user_list) {
            const list  = await couponUserMappingRepository.find({where: {user_id: userId}});

            for (const i of list) {
                // 여기서 기간 조건을 걸어야됨.
                // couponSet.add(i.coupon_id); // 중복되면 자동으로 무시됨

                let dateRange;

                if (coupon_start_date && adjustedEndDate) {
                    dateRange = Between(coupon_start_date, adjustedEndDate);
                } else if (coupon_start_date) {
                    dateRange = Between(coupon_start_date, new Date());
                }

                const whereClause = { id: i.coupon_id };
                if (dateRange) {
                    whereClause.created_at = dateRange;
                }

                const coupon = await serviceCouponRepository.findOne({ where: whereClause });

                if (!coupon) continue; // 기간 조건에 맞지 않으면 skip
                couponSet.add(i.coupon_id); // 중복 제거
            }
        }

        // 배열 변환 + id 내림차순 정렬
        const couponList = Array.from(couponSet).sort((a, b) => b - a);


        console.log("sortedCouponIds =", couponList);
        return couponList;
    } catch(error) {
        console.log("error = ", error);
    }
}


// 쿠폰 유저 매핑 조회
export async function getCouponUserMapping(coupon_list, page = 1, limit = 10, info) {
    try {
    
        const result_list = [];

        // offset, end 계산
        const offset = (page - 1) * limit;
        const pagedCoupons = coupon_list.slice(offset, offset + limit);

        // 전체 plan별 쿠폰 수 합계를 담을 객체
        const plan_count_summary = {};

        // 먼저 전체 쿠폰에 대해 plan별 카운트 집계
        for (const i of coupon_list) {
            const cpm = await couponPlanMappingRepository.find({ where: { coupon_id: i } }); // coupon id 맵핑된 plan row 찾기
            let cum = await couponUserMappingRepository.find({where : {coupon_id: i}});
            // staff 조건 유무로 CUM에서 제외시키기
            if (info.is_staff !== undefined && info.is_staff !== null) {
                const newCum = [];
                for (const row of cum) {
                    const user_id = row.user_id;
                    const user = await userRepo.findOne(user_id);
                    if(user.is_staff === false || user.is_staff === 'false') {
                        newCum.push(row);
                    }
                }
                cum = newCum;
            }
          
            const remainingCount = cum.length - 1;
            console.log("remaincount == ", remainingCount);
            for (const p of cpm) {
                
                const pricingPlan = await pricingplanRepo.find({ plan_id: p.pricing_plan_id }); // 맵핑된 plan_id로 plan 정보 찾기
                if (!pricingPlan || pricingPlan.length === 0) continue; // plan 정보가 없으면 넘어가기

                const service = await serviceRepo.find({ service_id: pricingPlan[0].service_id }); // plan정보의 service_id로 서비스정보 찾기
                if (!service || service.length === 0) continue; // 

                const planName = service[0].name; // 서비스이름을 planName으로 함

                // count 합산
                // plan_count_summary[planName] = (plan_count_summary[planName] || 0) + p.count;
                if (remainingCount > 0) {
                    console.log()
                    plan_count_summary[planName] = (plan_count_summary[planName] || 0) + (p.count * Number(cum.length));
                } else {
                    plan_count_summary[planName] = (plan_count_summary[planName] || 0) + p.count;
                }                
            }
        }

        let endDate = null;
		if (info.coupon_end_date) {
			const tempDate = new Date(info.coupon_end_date);
			tempDate.setDate(tempDate.getDate() + 1); // 하루 뒤로
			endDate = tempDate.toISOString();
		}


        for (const i of pagedCoupons) {
            // const coupon = await serviceCouponRepository.findOne({where: {id: i}});
            const whereClause = { id: i };

            if (info.coupon_start_date && endDate) {
                whereClause["created_at"] = Between(info.coupon_start_date, endDate);
            } else if (info.coupon_start_date) {
                whereClause["created_at"] = Between(info.coupon_start_date, new Date()); 
            }

            // 쿠폰 조회
            const coupon = await serviceCouponRepository.findOne({ where: whereClause });
            if (!coupon) continue; // 기간조건에 안맞으면 skip
            let cum = await couponUserMappingRepository.find({where : {coupon_id: i}});
            const cpm = await couponPlanMappingRepository.find({
                where: {coupon_id: i},
                order: {id: 'ASC'}            
            });

           
            // staff 조건 유무로 CUM에서 제외시키기
            if (info.is_staff !== undefined && info.is_staff !== null) {
                const newCum = [];
                for (const row of cum) {
                    const user_id = row.user_id;
                    const user = await userRepo.findOne(user_id);
                    if(user.is_staff === false || user.is_staff === 'false') {
                        newCum.push(row);
                    }
                }
                cum = newCum;
            }
            // 유저 리스트 첫 번째 + 외 n명
            let user_list = [];

            if (cum.length > 0) {
                const user_id = cum[0].user_id;
                const user = await userRepo.findOne(user_id);
                const remainingCount = cum.length - 1;
                const country = await countryRepo.find({country_id: user.country_id});

                if (remainingCount > 0) {
                    user_list = [{
                        dental_name: `${user.dental_name} 외 ${remainingCount}`,
                        country_id: country[0].id,
                        country_name: country[0].name_kr
                    }];
                } else {
                    user_list = [{
                        dental_name: user.dental_name,
                        country_id: country[0].id,                    
                        country_name: country[0].name_kr
                    }];
                }
            }
            
            // plan_list에 실제 플랜 정보 가져오기
            const plan_list = [];
            for (const p of cpm) {            
                const pricingPlan = await pricingplanRepo.find({ plan_id: p.pricing_plan_id });
                const service = await serviceRepo.find({ service_id: pricingPlan[0].service_id });
                plan_list.push({
                    plan_name: service[0].name,  // 예: plan의 이름
                    count: p.count
                });
            }

            const couponData = {
                coupon_id: coupon.id,
                give_date: coupon.created_at,
                user_list: user_list,
                plan_list: plan_list
            };

            result_list.push(couponData);
        }

       
        const resData = {
            total_history_count : coupon_list.length,
            plan_count_summary: plan_count_summary,
            result_list : result_list,

        }
        
        return resData;
        
    } catch(error) {
        console.log("error = ", error);
    }
}


// 쿠폰 리스트 조회
export async function couponDetail(coupon_id, info) {
    try {     
        const couponDetail  = await serviceCouponRepository.findOne({where: {id: coupon_id}});

        let cum = await couponUserMappingRepository.find({where: {coupon_id: coupon_id}});
        const cpm = await couponPlanMappingRepository.find({where: {coupon_id: coupon_id}});
        
        const plan_count_summary = {};

        let total_coupon_count = 0;
        // 먼저 전체 쿠폰에 대해 plan별 카운트 집계
        
        for (const p of cpm) {
            const pricingPlan = await pricingplanRepo.find({ plan_id: p.pricing_plan_id }); // 맵핑된 plan_id로 plan 정보 찾기
            if (!pricingPlan || pricingPlan.length === 0) continue; // plan 정보가 없으면 넘어가기

            const service = await serviceRepo.find({ service_id: pricingPlan[0].service_id }); // plan정보의 service_id로 서비스정보 찾기
            if (!service || service.length === 0) continue; // 

            const planName = service[0].name; // 서비스이름을 planName으로 함

            // count 합산
            plan_count_summary[planName] = (plan_count_summary[planName] || 0) + p.count;

            // 토탈 쿠폰 카운트
            total_coupon_count += p.count;
        }
        
        const user_list = [];

        // 먼저 전체 쿠폰에 대해 plan별 카운트 집계

        if (info.is_staff !== undefined && info.is_staff !== null) {
            const newCum = [];
            for (const row of cum) {
                const user_id = row.user_id;
                const user = await userRepo.findOne(user_id);
                if(user.is_staff === false || user.is_staff === 'false') {
                    newCum.push(row);
                }
            }
            cum = newCum;
        }
        
        for (const u of cum) {
            const user_id = u.user_id;
            const user = await userRepo.findOne(user_id);

            user_list.push(user.dental_name);
        }
       
        console.log(couponDetail);

        const resData = {
            coupon_id: couponDetail.id,
            give_date: couponDetail.created_at,
            duration: couponDetail.duration,
            total_coupon_count: total_coupon_count,
            plan_list: plan_count_summary,
            total_user_count: cum.length,
            user_list: user_list
        }
        
        return resData;
    } catch(error) {
        console.log("error = ", error);
    }
}

// 쿠폰 내용(지급횟수, 유효기간) 수정
export async function updatedCoupon(info) {
    try {
      const { welcome_coupon, payment_coupon } = info;
  
      // 공통 업데이트 함수
      async function updateCoupon(keyword, coupon) {
        const query = `
          UPDATE public.admin_panel_pricingplan
          SET quantity = $2,
              duration = $3
          WHERE name ILIKE $1
          RETURNING *;
        `;
        const values = [`%${keyword}%`, coupon.quantity, coupon.duration];
        return db_homepage.query(query, values);
      }
  
      const results = {};
  
      if (welcome_coupon) {
        results.welcome = await updateCoupon("회원가입", welcome_coupon);
      }
  
      if (payment_coupon) {
        results.payment = await updateCoupon("증정", payment_coupon);
      }
  
      return "success"
    } catch (error) {
      console.error("updatedCoupon error:", error);
      throw error;
    }
  }

// 쿠폰 
export async function couponSetting() {
    try {
        // 공통 업데이트 함수
        
        const welcomeQuery = `
            SELECT p.id, p.name, p.duration, p. quantity
            FROM public.admin_panel_pricingplan p
            WHERE id = 1
        `;
        
        const welcome_coupon = await db_homepage.query(welcomeQuery);
        
        const paymentQuery = `
            SELECT p.id, p.name, p.duration, p. quantity
            FROM public.admin_panel_pricingplan p
            WHERE id = 2
        `;  
    
        const payment_coupon = await db_homepage.query(paymentQuery);

        return {
            welcome_coupon: welcome_coupon.rows[0],
            payment_coupon: payment_coupon.rows[0]
        }
    } catch (error) {
        console.error("updatedCoupon error:", error);
        throw error;
    }
}