import * as userRepo from '../repositories/user.repository.js';
import * as countryRepo from '../repositories/country.repository.js';
import * as tenantRepo from '../repositories/tenant.repository.js';
import * as serviceRepo from '../repositories/service.repository.js';
import * as pricingplanRepo from '../repositories/pricingplan.repository.js';
import * as paymentRepo from '../repositories/payment.repository.js';
import * as promotionRepo from '../repositories/promotion.repository.js';
import * as questionsRepo from '../repositories/questions.repository.js';

import { resetUserPasswordHtml } from '../utils/email_template.js';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// 메일 전송
import nodemailer from 'nodemailer';
import { countReset, info } from 'console';

// 문의 리스트 조회
export async function getList(page, limit, info) {
    // info = {
    //    
    // }
    let users;
    // users = await userRepo.find({is_staff : 'false'}); 
    users = await userRepo.find({}); // 테스트목적으로 is_staff 조건 안걸음. 추후 운영서버에선 조건 걸 수 있음.
    
   
    let tenant_list = [];
    if (users && Array.isArray(users.client_list) && users.client_list.length > 0) {
      tenant_list = await Promise.all(
        users.client_list.map(async user => user.schema_name)
      );
    }

    console.log("tenant_length == ", tenant_list.length);
    // 만약 tenant_list가 비어있으면 바로 빈 결과 반환
    if (tenant_list.length === 0) {
      return {
        total_count: 0,
        cancelHistory_list: []
      };
    }

    // 테넌트 리스트
    info.tenant_list = tenant_list;

    const questions = await questionsRepo.find(page, limit, info);

    console.log("questions == ", questions);

    const filterQuestions = await Promise.all(
      questions.questions_list.map(async (q, i) => {
          const user = await userRepo.findOneBySchema(q.tenant);

          console.log(q);

          return {
              num: (page - 1) * limit + (i + 1),
              question_idx: q.id,
              created_at: q.created_at,
              question_type: q.type_name,
              question_type_id: q.question_type_id,
              title: q.title,
              content: q.contents,
              user_idx: user.id,
              dental_name: user.dental_name,
              full_name: user.full_name,
              status: q.status
          };
      })
  );


    return {total_count: questions.total_count, questions_list: filterQuestions};
}

// 문의 리스트 조회
export async function getDetail(user_id, question_id) {
    // info = {
    //   duration,
    //   service_list,
    //   user_list
    // }
    const user = await userRepo.findOne(user_id);
    
    const tenant_name = user.schema_name;
    const question = await questionsRepo.findOne(tenant_name, question_id);

    const schema_number = user.schema_name.match(/\d+$/)[0];
    
    const returnData = {
        question_idx: question.id,
        created_at: question.created_at,
        question_type: question.type_name,
        title: question.title,
        user_idx: user.id,
        content: question.contents,
        answer: question.answer,
        schema_number: schema_number,
        dental_name: user.dental_name,
        full_name: user.full_name,
        status: question.status
    }

    console.log("question == ", returnData);
    return returnData;
}
