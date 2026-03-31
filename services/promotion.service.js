import * as userRepo from '../repositories/user.repository.js';
import * as countryRepo from '../repositories/country.repository.js';
import * as tenantRepo from '../repositories/tenant.repository.js';
import * as serviceRepo from '../repositories/service.repository.js';
import * as pricingplanRepo from '../repositories/pricingplan.repository.js';
import * as paymentRepo from '../repositories/payment.repository.js';
import * as promotionRepo from '../repositories/promotion.repository.js';

import { resetUserPasswordHtml } from '../utils/email_template.js';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// 메일 전송
import nodemailer from 'nodemailer';
import { countReset, info } from 'console';

// 모든 유저 취소 내역 조회 + 조건 검색
export async function giveCoupon(info) {
    // info = {
    //   duration,
    //   service_list,
    //   user_list
    // }
    console.log("give_coupon_info == ", info);
    // 쿠폰 생성
    const createdCoupon = await promotionRepo.createCoupon(info);

    // 생선된 쿠폰 id
    const coupon_id = createdCoupon.id;

    // 서비스마다 쿠폰 개수 매핑
    const couponPlanMapping = await promotionRepo.couponPlanMapping(coupon_id, info);

    // 지급된 유저와 쿠폰 매핑
    const couponUserMapping = await promotionRepo.couponUserMapping(coupon_id, info);

    // // 유저에게 쿠폰 지급
    // const giveCoupon = await promotionRepo.giveCoupon(info);

    // // 유저에게 알림 보냄
    // const sendAlarm = await promotionRepo.sendAlarm(info);

    return {createdCoupon, couponPlanMapping, couponUserMapping};
}

// 쿠폰 내역 정보 조회
export async function getCouponDetailHistory(coupon_id, info) {
  
    // 유저에 관련된 쿠폰의 리스트
    const coupon = await promotionRepo.couponDetail(coupon_id, info);

    return coupon;
}

// 쿠폰 내역 정보 조회
export async function getCouponHistoryList(page, limit, info) {
  let users;
  // if (info.dental_name !== undefined && info.dental_name !== null) {
  //   users = await userRepo.find({dental_name: info.dental_name});
  // } else {
  //   users = await userRepo.find({});
  // }

  console.log("info == ", info);
  // if (info.dental_name !== undefined && info.dental_name !== null) {
  //   users = await userRepo.find({dental_name: info.dental_name, is_staff : 'false'});
  // } else {
  //   users = await userRepo.find({is_staff : 'false'});
  // }

  users = await userRepo.find(info);
  let user_list = [];
  if (users && Array.isArray(users.client_list) && users.client_list.length > 0) {
    user_list = await Promise.all(
      users.client_list.map(async user => user.id)
    );
  }

  // 만약 user_list가 비어있으면 바로 빈 결과 반환
  if (user_list.length === 0) {
    return {
      total_count: 0,
      couponHistory_list: []
    };
  }

  // user_list
  info.user_list = user_list;
  
  // 유저에 관련된 쿠폰의 리스트
  const couponList = await promotionRepo.couponList(info);

  // 쿠폰의 유저 맵핑
  const couponUserMapping = await promotionRepo.getCouponUserMapping(couponList, page, limit, info);
  
  const fiterCouponMapping = await Promise.all(
    couponUserMapping.result_list.map(async (c, i) => {
      return {
        num: (page - 1) * limit + (i + 1),
        coupon_idx: c.coupon_id,
        give_date: c.give_date,
        user_list: c.user_list,
        plan_list: c.plan_list
      }
    })
  )

  return {
      total_history_count: couponUserMapping.total_history_count, 
      plan_count_summary: couponUserMapping.plan_count_summary,
      result_list : fiterCouponMapping
  }
}

// 쿠폰 내역 정보 조회
export async function updateCoupon(info) { 
    console.log("info == ", info);
    
    // info = {
    //   welcome_coupon : {
    //     quantity : 1,
    //     duration: 180
    //   },
    //   payment_coupon: {
    //     quantity: 1,
    //     duration: 180
    //   }
    // }
  
    // 유저에 관련된 쿠폰의 리스트
    console.log("welcom == ", info.welcome_coupon);
    // 빈 객체 체크 함수
    // 빈/무효 객체 체크 함수
    const isInvalid = (obj) => {
      // null, undefined 이거나
      if (!obj || Object.keys(obj).length === 0) return true;
      // 모든 값이 null 또는 undefined 인 경우
      return Object.values(obj).every(v => v === null || v === undefined);
    };


    if (isInvalid(info.welcome_coupon) && isInvalid(info.payment_coupon)) {
        return {message : "요청데이터 없음", reqData: info};
    }

    const updatedCoupon = await promotionRepo.updatedCoupon(info);
   
    return updatedCoupon;
}

// 쿠폰 내역 정보 조회
export async function couponSetting() { 
 
  // 유저에 관련된 쿠폰의 리스트
  const updatedCoupon = await promotionRepo.couponSetting();
 
  return updatedCoupon;

  
}
