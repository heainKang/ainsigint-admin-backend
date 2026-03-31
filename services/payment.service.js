import * as userRepo from '../repositories/user.repository.js';
import * as countryRepo from '../repositories/country.repository.js';
import * as tenantRepo from '../repositories/tenant.repository.js';
import * as serviceRepo from '../repositories/service.repository.js';
import * as pricingplanRepo from '../repositories/pricingplan.repository.js';
import * as paymentRepo from '../repositories/payment.repository.js';

import { resetUserPasswordHtml } from '../utils/email_template.js';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// 메일 전송
import nodemailer from 'nodemailer';
import { countReset, info } from 'console';

// 모든 유저 결제 내역 조회 + 조건 검색
export async function getHistories(page, limit, info) {
    page = Number(page) || 1;
    limit = Number(limit) || 10;
    // info = {
    //   dental_name,
    //   start_date,
    //   end_date
    // }  
    let users;
    if (info.dental_name !== undefined && info.dental_name !== null) {
      users = await userRepo.find({dental_name: info.dental_name, is_staff : 'false'});
    } else {
      users = await userRepo.find({is_staff : 'false'});
    }

    // let users;
    // if (info.dental_name !== undefined && info.dental_name !== null) {
    //   users = await userRepo.find({dental_name: info.dental_name});
    // } else {
    //   users = await userRepo.find();
    // }

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

    // tenant_list
    info.tenant_list = tenant_list;

    // 결제내역 조회
    const histories = await paymentRepo.getPayments(page, limit, info);

    // 전체 가격
    const total_amount = Math.floor(Number(histories.total_amount));

    // 취소필터 시 취소내역 조회
    // if (info.cancel_status !== undefined && info.cancel_status !== null) {
    //     const cancel_histories = await paymentRepo.getCancelPayment(page, limit, info);
    // }
    
    if (histories.paymentHistory_list.length === 0) {
        return {
          total_count: 0,
          paymentHistory_list: []
        };
      }

    const payment_history = await Promise.all(
        histories.paymentHistory_list.map(async (history, index) => {
            const tenant_name = history.tenant; // 테넌트 이름
            const user = await userRepo.findOneBySchema(tenant_name); // 테넌트로 유저 찾기
            const assethistory = await paymentRepo.getPaymentHistory(tenant_name, history.id); // 테넌트 + payment_id로 assetHistory 찾기 -> assetHistory는 왜 찾지?

            const cancelPayment = history.cancel_status;
            const payment_price = Number(history.total_price);
            
            const refund_amount = Number(history.refund_amount); // 환불 금액
            const isRefunded = refund_amount !== 0; // 환불 되었는지? 보는거?

            const groupedHistories = new Map();

            for (const row of assethistory) {
                const plan_id = row.pricing_plan_id; // plan_id
                const pricingPlan = await pricingplanRepo.find({ plan_id: plan_id });
                const planName = pricingPlan[0].name;
                const service = await serviceRepo.find({ service_id: pricingPlan[0].service_id });
        
                // ✅ 안전하게 cancel_status 추출
                const cancel_status = history?.cancel_status ?? null;
                const isCanceled = cancel_status !== null;
        
                const payment_id = history.id;
                const key = `${payment_id}`;
        
                if (!groupedHistories.has(key)) {
                    groupedHistories.set(key, {
                        payment_id: payment_id,
                        payment_date: history.created_at,
                        dental_name: user.dental_name,
                        user_id: user.id,
                        service_name_arr: [service[0].name],
                        payment_name_arr: [planName],
                        payment_price: isRefunded ? refund_amount : Number(row.total_price), // 환불금액
                        payment_status: isCanceled ? '-' : history.pay_status, // 거래 상태
                        cancel_refund_status: cancel_status
                    });
                } else {
                    const existing = groupedHistories.get(key);
        
                    if (!existing.service_name_arr.includes(service[0].name)) {
                        existing.service_name_arr.push(service[0].name);
                    }
        
                    if (!existing.payment_name_arr.includes(planName)) {
                        existing.payment_name_arr.push(planName);
                    }
        
                    existing.payment_price += Number(row.total_price);
                }
            }


            // 최종 포맷으로 변환
            // 1건만 있으니 groupedHistories.values().next().value 로 꺼냄
            const item = Array.from(groupedHistories.values())[0];
            const serviceCount = item.service_name_arr.length;
            const paymentCount = item.payment_name_arr.length;

            return {
                num: (page - 1) * limit + (index + 1),
                payment_id: item.payment_id,
                action_date: item.payment_date,
                dental_name: item.dental_name,
                user_id: item.user_id,
                service_name: serviceCount > 1
                    ? `${item.service_name_arr[0]} 외 ${serviceCount - 1}건`
                    : item.service_name_arr[0],
                payment_name: paymentCount > 1
                    ? `${item.payment_name_arr[0]} 외 ${paymentCount - 1}건`
                    : item.payment_name_arr[0],
                payment_price: item.payment_price.toLocaleString('ko-KR') + ' 원',
                payment_status: item.payment_status,
                cancel_refund_status: item.cancel_refund_status
            };
            
        })
    )
  
    return {
        total_count: histories.totalCount.toLocaleString('ko-KR'), 
        total_amount: total_amount.toLocaleString('ko-KR'), 
        paymentHistory_list: payment_history
    };
}

// 결제 상세 내역 조회
export async function getPaymentDetail(payment_id, user_id) {
    // 결제의 주문번호? payment_id? 로 db 검색해서 조회하기.
    const user = await userRepo.findOne(user_id); // 유저 정보 찾음. 
    const tenant_name = user.schema_name;
    
    // 결제 내역
    const payment = await paymentRepo.findPayment(tenant_name, payment_id);
    
    // 결제 상세 내역
    const payment_history = await paymentRepo.getPaymentHistory(tenant_name, payment_id);

    // 결제 상세 내역 정보들
    const order_number= payment[0].payment_order_no;
    const nick_name = user.nickname;
    const dental_name = user.dental_name;
    const action_date = payment[0].created_at;
    const total_price = Math.floor(Number(payment[0].total_price));
    const payment_method = payment[0].payment_method;
    const pay_status = payment[0].pay_status;
    
    // 결제 상세 내역
    const payment_detail = {
        order_number: order_number,
        nick_name: nick_name,
        dental_name: dental_name,
        action_date: action_date,
        total_price: total_price.toLocaleString('ko-KR'),
        payment_method: payment_method,
        pay_status: pay_status
    };

    // 상품정보, 혜택정보
    const payment_info_list = [];
    let total_amount = 0;
    let favor_info = {};

    for (let i = 0; i < payment_history.length; i++) {
        const history = payment_history[i];
        const plan_id = history.pricing_plan_id;
        const pricingPlan = await pricingplanRepo.find({ plan_id: plan_id });
        const planName = pricingPlan[0].name; // 이용권, 쿠폰 이름
        const service = await serviceRepo.find({ service_id: pricingPlan[0].service_id });
        const unit_price = Number(history.unit_price);
        const amount = Number(history.quantity);
        const total_price = unit_price * amount;

        
        // // favor_info는 asset_type === 0(쿠폰)일 때만 설정
        // if (history.asset_type === 0) {
        //     favor_info = {
        //         favor_name: history.asset_info,
        //         favor_detail: `${service[0].name} COUPON`,
        //         amount: history.quantity
        //     };
        // } else {
        //     payment_info_list.push({
        //         num: i + 1,
        //         service_name: service[0].name,
        //         payment_name: planName,
        //         unit_price: unit_price.toLocaleString('ko-KR'),
        //         amount: history.quantity,
        //         total_price: total_price.toLocaleString('ko-KR') + ' 원'
        //     });
        // }

         // favor_info는 asset_type === 0(쿠폰)일 때만 설정
         if (history.asset_type === 0) {
            favor_info = {
                favor_name: history.asset_info,
                favor_detail: `${service[0].name} COUPON`,
                amount: history.quantity
            };
        } else if (history.asset_type ===1 && history.action_type === 0) {
            total_amount += total_price;
            payment_info_list.push({
                num: i + 1,
                service_name: service[0].name,
                payment_name: planName,
                unit_price: unit_price.toLocaleString('ko-KR'),
                amount: history.quantity,
                total_price: total_price.toLocaleString('ko-KR') + ' 원'
            });
        }
    }

    // 취소 환불 정보
    const cancelPayment = await paymentRepo.findCancelPayment(tenant_name, payment_id);

    const refund_info_list = [];
    if (cancelPayment) {
        for (let i = 0; i < cancelPayment.length; i++) {
            const cancelHistory = cancelPayment[i];
            const cancel_id = cancelHistory.id;
            const cancelled_at = cancelHistory.cancelled_at; // 취소접수일
            const cancel_status = cancelHistory.cancel_status; // 처리상태
            const ended_at = cancelHistory.ended_at; // 처리일시
            const refund_bank = cancelHistory.refund_bank; // 환불은행
            const refund_account = cancelHistory.refund_account; // 환불계좌
            const refund_account_name = cancelHistory.refund_account_name; // 예금주
            const payment_price = Number(payment[0].total_price); // 결제금액
            const refund_price = Number(cancelHistory.refund_amount); // 환불금액    
            // favor_info는 asset_type === 0일 때만 설정
    
            refund_info_list.push({
                cancelled_at: cancelled_at, // 취소접수일
                cancel_status: cancel_status, // 처리상태
                ended_at: ended_at, // 처리일시
                refund_bank: refund_bank, // 환불은행
                refund_account: refund_account, // 환불계좌
                refund_account_name: refund_account_name, // 예금주
                payment_price: payment_price.toLocaleString('ko-KR') + ' 원',
                refund_price: refund_price.toLocaleString('ko-KR') + ' 원' // 환불금액
            });
        }
    }

    const result = {
        payment_detail : payment_detail,
        payment_info: {
            count: payment_info_list.length, 
            list: payment_info_list, 
            total_amount: total_amount.toLocaleString('ko-KR')+ ' 원'},
        favor_info: favor_info,
        cancel_refund_info: (cancelPayment && cancelPayment.length > 0)
        ? {
            refund_reason: cancelPayment[0]?.reason_title,
            list: refund_info_list
        }
        : {
            refund_reason: null,
            list: []
        }
    }


    // 결제 상세 내역 (주문번호, 유저 내용)
    // 상품 정보
    // 혜택 정보
    // 취소*환불 정보

    return result;
}

// 모든 유저 취소 내역 조회 + 조건 검색
export async function getCancelHistory(page, limit, info) {
    page = Number(page) || 1;
    limit = Number(limit) || 10;
    // info = {
    //   dental_name,
    //   start_date,
    //   end_date
    // }  
    // if (info && Object.keys(info).length > 0) {
    //   console.log("검색 조건이 있을때 -> 취소 내역");
    //   const histories = await findCancelHistory(info, page, limit);
    //   return histories;
    // }
    // info 초기화
    // info = typeof info === 'object' && info !== null ? info : {};

    let users;
    if (info.dental_name !== undefined && info.dental_name !== null) {
      users = await userRepo.find({dental_name: info.dental_name, is_staff : 'false'});
    } else {
      users = await userRepo.find({is_staff : 'false'});
    }

    // let users;
    // if (info.dental_name !== undefined && info.dental_name !== null) {
    //   users = await userRepo.find({dental_name: info.dental_name});
    // } else {
    //   users = await userRepo.find({});
    // }


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

    // 테넌트 리스트
    info.tenant_list = tenant_list;

    // 취소내역
    const cancelHistories = await paymentRepo.getCancelPayment(page, limit, info);
    
    // 총 매출금액
    const total_amount = Math.floor(Number(cancelHistories.total_amount));
    // 총 취소금액
    const refund_total_amount = Math.floor(Number(cancelHistories.refund_total_amount));

    if (cancelHistories.cancelHistory_list.length === 0) {
        return {
          total_count: 0,
          cancelHistory_list: []
        };
      }

    const cancel_history = await Promise.all(
        cancelHistories.cancelHistory_list.map(async (history, i) => {
            const tenant_name = history.tenant;
            const user = await userRepo.findOneBySchema(tenant_name);
            const payment = await paymentRepo.findPayment(tenant_name, history.payment_id); 

            const payment_price = Math.floor(Number(payment[0].total_price));
            const refund_price = Math.floor(Number(history.refund_amount));
            return {
                num: (page - 1) * limit + (i + 1),
                user_id: user.id,
                cancel_id: history.id,
                cancelled_at: history.cancelled_at,
                dental_name: user.dental_name,
                payment_price: payment_price.toLocaleString('ko-KR') + ' 원',
                cancel_status: history.cancel_status,
                refund_price: history.cancel_status === 1 
                ? refund_price.toLocaleString('ko-KR') + ' 원' 
                : '-',
                ended_at: history.ended_at
            }
        })
    )
  
    return {
        total_count: cancelHistories.totalCount.toLocaleString('ko-KR'), 
        total_amount: total_amount.toLocaleString('ko-KR'), 
        refund_total_amount: refund_total_amount.toLocaleString('ko-KR'), 
        cancelHistory_list: cancel_history
    };
}

// 취소 상세 내역 조회
export async function getCancelDetail(cancel_id, user_id) {
    // 결제의 주문번호? payment_id? 로 db 검색해서 조회하기.
    const user = await userRepo.findOne(user_id); // 유저 정보 찾음. 
    const tenant_name = user.schema_name;
    
    // 취소 내역
    const cancelPayment = await paymentRepo.findCancelPaymentByCancelId(tenant_name, cancel_id);
    
    // 결제 내역
    const payment_id = cancelPayment[0].payment_id;
    const payment = await paymentRepo.findPayment(tenant_name, payment_id);
    
    // 결제 상세 내역
    const payment_history = await paymentRepo.getPaymentHistory(tenant_name, payment_id);

    // 결제 상세 내역 정보들
    const order_number= payment[0].payment_order_no;
    const nick_name = user.nickname;
    const schema_name = user.schema_name;
    const schema_number = schema_name.match(/\d+$/)[0];
    const dental_name = user.dental_name;
    const action_date = payment[0].created_at;
    const total_price = Number(payment[0].total_price);
    const payment_method = payment[0].payment_method;
    const pay_status = payment[0].pay_status;
    
    // 결제 상세 내역
    const payment_detail = {
        order_number: order_number,
        schema_name: schema_name,
        schema_number: schema_number,
        nick_name: nick_name,
        dental_name: dental_name,
        action_date: action_date,
        total_price: total_price.toLocaleString('ko-KR'),
        payment_method: payment_method,
        pay_status: pay_status
    };

    // 상품정보, 혜택정보
    const payment_info_list = [];
    let total_amount = 0;
    for (let i = 0; i < payment_history.length; i++) {
        const history = payment_history[i];
        const plan_id = history.pricing_plan_id;
        const pricingPlan = await pricingplanRepo.find({ plan_id: plan_id });
        const planName = pricingPlan[0].name; // 이용권, 쿠폰 이름
        const service = await serviceRepo.find({ service_id: pricingPlan[0].service_id });
        const unit_price = Number(history.unit_price);
        const amount = Number(history.quantity);
        const total_price = unit_price * amount;

        total_amount += total_price;
        // favor_info는 asset_type === 0일 때만 설정
        if (history.asset_type === 1) {
            payment_info_list.push({
                num: i + 1,
                service_name: service[0].name,
                payment_name: planName,
                unit_price: unit_price.toLocaleString('ko-KR'),
                amount: history.quantity,
                total_price: total_price.toLocaleString('ko-KR') + ' 원'
            });  
        }
    }

    // 취소 환불 정보
    const cancelled_at = cancelPayment[0].cancelled_at; // 취소 요청일시
    const refund_reason = cancelPayment[0].reason_title; // 취소 및 환불 사유
    const reason = cancelPayment[0].reason; // 상세 취소 사유
    const refund_bank = cancelPayment[0].refund_bank; // 환불은행
    const refund_account = cancelPayment[0].refund_account; // 환불계좌
    const refund_account_name = cancelPayment[0].refund_account_name; // 예금주
    const ended_at = cancelPayment[0].ended_at; // 처리일시
    const cancel_status = cancelPayment[0].cancel_status; // 처리상태
    const refund_price = Number(cancelPayment[0].refund_amount); // 환불금액   

    const cancel_refund_info = {
        cancel_id: cancel_id,
        cancelled_at: cancelled_at, // 취소접수일
        refund_reason: refund_reason,
        refund_bank: refund_bank, // 환불은행
        refund_account: refund_account, // 환불계좌
        refund_account_name: refund_account_name, // 예금주
        account_inf: `${refund_bank} ${refund_account} (예금주 :${refund_account_name})`
    }

     // ended_at이 존재할 경우에만 아래 정보 추가
     if (reason !== null && reason !== undefined && reason !== "") {
        cancel_refund_info.refund_reason = `${refund_reason} : ${reason}`; // 처리상태
    }
   
    // ended_at이 존재할 경우에만 아래 정보 추가
    if (ended_at !== null && ended_at !== undefined) {
        cancel_refund_info.ended_at = ended_at; // 처리상태
        cancel_refund_info.cancel_status = cancel_status; // 처리상태
        cancel_refund_info.refund_price = refund_price.toLocaleString('ko-KR') + ' 원'; // 환불금액
    }


    const result = {
        payment_detail : payment_detail,
        cancel_refund_info: cancel_refund_info,
        payment_info: {
            count: payment_info_list.length, 
            list: payment_info_list, 
            total_amount: total_amount.toLocaleString('ko-KR')+' 원'
        }
    }
    // 결제 상세 내역 (주문번호, 유저 내용)
    // 상품 정보
    // 혜택 정보
    // 취소*환불 정보

    return result;
}

// 취소 반려
export async function rejectCancelRequest(cancel_id, user_id, cancel_status) {
    try {
        // 결제의 주문번호? payment_id? 로 db 검색해서 조회하기.
        const user = await userRepo.findOne(user_id); // 유저 정보 찾음. 
        const tenant_name = user.schema_name;
        
        // 취소 내역
        const cancelPayment = await paymentRepo.rejectCancelPaymentByCancelId(tenant_name, cancel_id, cancel_status);

        console.log("cancel_status == ", cancelPayment[0].cancel_status);

        return {status: "success", message: "취소 반려 처리", cancel_status: cancelPayment[0].cancel_status}
    } catch (error) {
        console.error("❌ error = ", error);
        throw error;
    }
}
    
// 전액 환불 처리
export async function confirmCancelRequest(cancel_id, user_id, cancel_status) {
   // 결제의 주문번호? payment_id? 로 db 검색해서 조회하기.
   const user = await userRepo.findOne(user_id); // 유저 정보 찾음. 
   const tenant_name = user.schema_name;
   
   // 취소 내역
   const cancelPayment = await paymentRepo.confirmCancelPaymentByCancelId(tenant_name, cancel_id, cancel_status);


   return {status: "success", message: "전액 환불 처리", cancel_status: cancelPayment[0].cancel_status}
}

// 전액 환불 처리
export async function processCancelRequest(cancel_id, user_id, cancel_status) {
    // 결제의 주문번호? payment_id? 로 db 검색해서 조회하기.
    const user = await userRepo.findOne(user_id); // 유저 정보 찾음. 
    const tenant_name = user.schema_name;
    
    // 취소 처리
    // cancel_status = 0 : 취소요청, 1: 전액환불, 2: 취소반려
    const cancelPayment = await paymentRepo.processCancelPaymentByCancelId(tenant_name, cancel_id, cancel_status);
 
    if (cancelPayment[0].cancel_status === 1) {
        return {status: "success", message: "전액 환불 처리", cancel_status: cancelPayment[0].cancel_status}
    } else if (cancelPayment[0].cancel_status === 2) {
        return {status: "success", message: "취소 반려", cancel_status: cancelPayment[0].cancel_status}
    }
 }



 