import { admin } from '../models/admin.entity.js';
import * as adminRepo from '../repositories/admin.repository.js';
import path from 'path';
import fs from 'fs';
import { getUploadBasePath } from '../utils/uploadPaths.js';
        
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// 메일 전송
import nodemailer from 'nodemailer';

// 관리자 등록(ui에선 없음)
export async function signup(info) {
    try {
        const newAdmin = adminRepo.create(info);
    
        return {status: "success", msessage: "관리자 계정 등록", newAdmin: newAdmin.email};

    } catch(error) {
        console.log("** 에러 ====>", error);
    }
}

// 관리자 로그인
export async function login(info) {
    try {
        const { email, password } = info;
        const admin = await adminRepo.find(info);

        if (!admin) {
            return { status: "error", message: "등록된 아이디가 아닙니다." };
        }

        if (!password || !admin.password) {
            return { status: "error", message: "비밀번호 정보가 누락되었습니다." };
        }

        const isMatch = bcrypt.compareSync(password, admin.password);
        if (!isMatch) {
            return { status: "error", message: "아이디 또는 비밀번호가 잘못되었습니다." };
        }
        console.log("ismatch == ", isMatch);

         // 로그인 성공
         admin.login = true;
         const token = jwt.sign(
             { idx: admin.id, id: admin.email, authority: admin.authority },
             '556pT=W6Pr'
         );

         admin.token = token;
         return {
            status: "success",
            message: "로그인 성공",
            응답상태: 200,
            idx: admin.id,
            email: admin.email,
            token: token,
        };
        // if (isMatch) {
        //     admin.login = true;
        //     const token = jwt.sign(
        //         { idx: admin.id, id: admin.email, authority: admin.authority },
        //         '556pT=W6Pr'
        //     );
        //     admin.token = token;
        //     return {
        //         status: "success",
        //         message: "로그인 성공",
        //         응답상태: 200,
        //         idx: admin.id,
        //         token: token,
        //     };
        // } else {
        //     return { status: "error", message: "아이디 또는 비밀번호가 잘못되었습니다." };
        // }

        // let token = null;
        // if (admin) {
        //     if (bcrypt.compareSync(password, admin.password)) {
        //         admin.login = true;
        //         token = jwt.sign({ idx: admin.id, id: admin.email, authority: admin.authority}, '556pT=W6Pr');
        //         admin.token = token;
        //         return { status: "success", message: "로그인 성공", 응답상태: 200, idx : admin.id, token: token};
        //     } else {
        //         return { status: "error", message: "아이디 또는 비밀번호가 잘못되었습니다." };
        //     }
        // } else {
        //     return { message: "등록된 아이디가 아닙니다." };
        // }
    } catch(error) {
        console.log("** service error == ", error);
    }
}

// 비밀번호 초기화
export async function resetPassword() {
    try {
        const info = {
            email : "keyonbit@gmail.com"
        }
        const admin = await adminRepo.find(info);

        if (!admin) {
            return { status: "fail", message: "관리자 찾기 못함." };
        }

         // ✅ 보안성 높은 랜덤 비밀번호 생성
         const authString = crypto.randomBytes(4).toString('hex'); // 8자리
         const hashedPassword = await bcrypt.hash(authString, 10);


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
            to: admin.email, // 인증을 요청한 이메일 주소
            subject: '[아인사이트] 임시 비밀번호 발급 안내',
            html: `
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9f9f9;">
            <div
                style=" max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                <h1 style="text-align: center; margin-bottom: 0;">아인사이트 관리자 임시 비밀번호 발급</h1>
                <p style="font-size: 16px; color: #555; line-height: 24px; text-align: center;">
                    안녕하세요, 임시 비밀번호 발급 안내해드립니다. <br>
                    아래의 임시 비밀번호를 입력하여 로그인 후 비밀번호를 변경해주세요.
                </p>
                <div style="text-align: center; margin: 20px 0;">
                    <span
                        style="display: inline-block; font-size: 24px; color: #3e86f2; font-weight: bold; padding: 10px 20px; border: 1px solid #3e86f2; border-radius: 5px;">
                        ${authString}
                    </span>
                </div>
                <p style="font-size: 14px; color: #777; text-align: center;">본 메일을 요청하지 않으셨다면 무시하셔도 됩니다.</p>
                <hr style="border: 0; height: 1px; background-color: #e0e0e0; margin: 20px 0;">
                <p style="font-size: 12px; color: #aaa; text-align: center;">
                    &copy; Copyright 2020 KeyonBIT  Corp. All Rights Reserved.
                </p>
            </div>
            </body>
            `
        };
    
          // ✅ SMTP 연결 확인
          await smtpTransport.verify();
          console.log("SMTP 서버 연결 성공");
  
          // ✅ 메일 발송
          await smtpTransport.sendMail(mailOptions);
          smtpTransport.close();
          console.log("메일 보내기 성공");

        // ✅ 메일 발송 성공 후 DB 업데이트
        admin.password = hashedPassword;
        const updateAdmin = await adminRepo.save(admin);

        if (updateAdmin) {
            console.log("비밀번호 업데이트 완료");
            return { status: "success", message: "비밀번호 초기화 성공", adminEmail: admin.email, temporaryPassword: authString};
        } else {
            console.log("비밀번호 업데이트 실패");
            return { status: "fail", message: "비밀번호 초기화 실패" };
        }


        
    } catch(error) {
        console.log("** 에러 ====>", error);
    }
}

// 관리자 비밀번호 수정
export async function updateAdminInfo(info) {
    try {
        const { originEmail, newEmail, contact, originPassword, newPassword } = info;
        info.email = originEmail;
        let admin = await adminRepo.find(info);

        if (!admin) {
            return { status: "error", message: "등록된 아이디가 아닙니다." };
        }

        if (originPassword) {
            const isMatch = bcrypt.compareSync(originPassword, admin.password);
            if (!isMatch) {
                return { status: "error", message: "기존 비밀번호가 잘못되었습니다." };
            }
        }    
        
        if (newPassword) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            admin.password = hashedPassword;
        }
       
        admin.email = newEmail;
        admin.contact = contact;
        const updateAdmin = await adminRepo.save(admin);

         return {
            status: "success",
            message: "정보 수정 및 비밀번호 변경 성공",
            응답상태: 200
        };
    } catch(error) {
        console.log("** service error == ", error);
    }
}

// ========== 💰 요금관리 비지니스 로직 💰 ==========

// 요금설정 조회 (언어별 필터링 추가)
export async function getPricingSettings(serviceId, lang = 'kor') {
    try {
        // lang 유효성 검증
        if (!['kor', 'eng'].includes(lang)) {
            return {
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'lang 매개변수는 "kor" 또는 "eng"만 허용됩니다.'
            };
        }

        // 특정 서비스 조회
        const service = await adminRepo.findServiceDefinitionById(serviceId);
        
        if (!service) {
            return {
                success: false,
                error: 'NOT_FOUND',
                message: '서비스를 찾을 수 없습니다.'
            };
        }
        
        // 요금플랜 조회 (언어별 필터링)
        const plans = await adminRepo.findPricingPlansByService(serviceId, lang);
        
        //컬럼이 not null이여서 공백처리 
        //삭제할때 프론트에서 name 필요하대서
        const logoImagePath = service.logo_image ? service.logo_image : null;
        const logoName = logoImagePath ? path.basename(logoImagePath) : null;
        //const logoName = logoImagePath; // DB의 logo_image 값 그대로 반환
        
        // 요금플랜 매핑
        const pricingPlanData = plans.map(plan => ({
            type: plan.type,
            plan_id: String(plan.id),
            name: plan.name,
            price: parseInt(plan.price),
            duration: plan.duration,
            display_title: plan.display_title,
            is_active: plan.is_active,
            updated_at: plan.updated_at
        }));
        
        // service_active: 플랜 중 하나라도 is_active가 true이면 true
        const serviceActive = pricingPlanData.some(plan => plan.is_active === true);
        
        const responseData = [{
            service_id: parseInt(service.id),
            name: service.name,
            logoImagePath: logoImagePath,
            logo_name: logoName,
            description: service.description,
            description_eng: service.description_eng || null,
            updated_at: service.uploaded_at,
            service_active: serviceActive,
            pricingplan: pricingPlanData
        }];
        
        return {
            success: true,
            data: responseData
        };
        
    } catch (error) {
        console.error('요금설정 조회 오류:', error);
        return {
            success: false,
            error: 'INTERNAL_ERROR',
            message: '요금설정 조회에 실패했습니다.'
        };
    }
}

// 요금설정 수정 (Form-data 전용)

const toBool = (v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v);


// 서비스 + 플랜 수정
export async function updatePricingSettings(serviceId, requestData, logoFile) {
  try {
    //console.log('=== updatePricingSettings 디버깅 ===');
    //console.log('serviceId:', serviceId);
    //console.log('requestData:', requestData);
    
    if (!Number.isInteger(serviceId)) {
      return { success: false, message: 'service_id는 정수여야 합니다.' };
    }

    const service = await adminRepo.findServiceDefinitionById(serviceId);
    if (!service) return { success: false, message: '서비스를 찾을 수 없습니다.' };
    
    //console.log('현재 서비스:', service);



    // Form-data 필드 유효성 검증 (description_eng 추가)
    const allowedFields = ['name', 'description', 'description_eng', 'keep_logo', 'pricingplan'];
    const receivedFields = Object.keys(requestData || {});
    const invalidFields = receivedFields.filter(field => !allowedFields.includes(field));
  
    /* 로고 부분 확인 튕겨서 임시 막음.   
    if (invalidFields.length > 0) {
      return { 
        success: false, 
        message: `유효하지 않은 필드명: ${invalidFields.join(', ')}. 허용되는 필드: ${allowedFields.join(', ')}` 
      };
    }
    */
    
    // Form-data 필드 수집
    const name            = requestData?.name;
    const description     = requestData?.description;
    const description_eng = requestData?.description_eng;
    const keep_logo       = requestData?.keep_logo !== undefined ? toBool(requestData.keep_logo) : undefined;
    
    // pricingplan은 Form-data에서 문자열로 전송됨
    let pricingplan;
    if (requestData?.pricingplan) {
      console.log('원본 pricingplan 문자열:', requestData.pricingplan);
      try {
        pricingplan = JSON.parse(requestData.pricingplan);
      } catch (error) {
        console.error('pricingplan JSON 파싱 오류:', error);
        console.error('파싱 시도한 문자열:', requestData.pricingplan);
        return { success: false, message: `pricingplan 형식이 올바르지 않습니다. 오류: ${error.message}` };
      }
    }

    console.log('파싱된 필드들:');
    console.log('- name:', name);
    console.log('- description:', description);
    console.log('- description_eng:', description_eng);
    console.log('- keep_logo:', keep_logo);
    console.log('- pricingplan:', pricingplan);

    // 업데이트 데이터 구성 (보낸 값만 반영)
    const next = {};
    if (name !== undefined) {
      const t = String(name).trim();
      if (!t) return { success: false, message: '서비스명은 필수값입니다.' };
      next.name = t;
    }
    if (description !== undefined) {
      next.description = description;
    }
    if (description_eng !== undefined) {
      next.description_eng = description_eng;
    }

    // 로고 처리
    const logoMut = await processLogoFile(service, logoFile, keep_logo);
    if (logoMut) Object.assign(next, logoMut);

    console.log('서비스 업데이트 데이터:', next);

    // 서비스 업데이트
    if (Object.keys(next).length > 0) {
      console.log('서비스 업데이트 실행');
      await adminRepo.updateServiceDefinition(serviceId, next);
    } else {
      console.log('서비스 업데이트할 데이터 없음');
    }

    // 요금플랜 (옵션)
    if (Array.isArray(pricingplan)) {
      console.log('요금플랜 업데이트 시작');
      for (const plan of pricingplan) {
        const { plan_id, ...fields } = plan;
        console.log(`플랜 ${plan_id} 업데이트:`, fields);
        if (!plan_id) continue;
        
        try {
          // 필드 유효성 검증
          const allowedFields = ['display_title', 'price', 'duration', 'is_active'];
          const receivedFields = Object.keys(fields);
          const invalidFields = receivedFields.filter(field => !allowedFields.includes(field));
          
          if (invalidFields.length > 0) {
            throw new Error(`유효하지 않은 필드명: ${invalidFields.join(', ')}. 허용되는 필드: ${allowedFields.join(', ')}`);
          }
          
          if (Object.keys(fields).length === 0) {
            throw new Error('업데이트할 필드가 없습니다.');
          }
          
          // 데이터 타입 변환 및 updated_at 추가
          const processedFields = { updated_at: new Date() };
          if (fields.display_title !== undefined) processedFields.display_title = fields.display_title;
          if (fields.price !== undefined) processedFields.price = Number(fields.price);
          if (fields.duration !== undefined) processedFields.duration = Number(fields.duration);
          if (fields.is_active !== undefined) processedFields.is_active = !!fields.is_active;
          
          const result = await adminRepo.updatePricingPlanPartial(plan_id, processedFields);
          
          // 업데이트 결과 확인
          if (result.affected === 0) {
            throw new Error(`플랜 ID ${plan_id}를 찾을 수 없습니다.`);
          }
          
          console.log(`플랜 ${plan_id} 업데이트 성공`);
        } catch (planError) {
          console.error(`플랜 ${plan_id} 업데이트 실패:`, planError.message);
          throw new Error(`플랜 ${plan_id} 업데이트 실패: ${planError.message}`);
        }
      }
    } else {
      console.log('요금플랜 데이터 없음 또는 배열이 아님');
    }

    console.log('=== updatePricingSettings 완료 ===');
    return { success: true };
  } catch (e) {
    console.error('요금설정 수정 오류:', e);
    return {
        success: false,
        message: e.message || '요금설정 수정 중 오류가 발생했습니다.',
        statusCode: 400
    };
  }
}

// 서비스 활성화/비활성화 토글
export async function toggleService(serviceId, isActive) {
    try {
        // service_id 유효성 검증
        if (!serviceId || isNaN(parseInt(serviceId))) {
            return {
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'service_id는 유효한 숫자여야 합니다.'
            };
        }
        
        const validServiceId = parseInt(serviceId);
        const service = await adminRepo.findServiceDefinitionById(validServiceId);
        if (!service) {
            return {
                success: false,
                error: 'NOT_FOUND',
                message: '서비스를 찾을 수 없습니다.'
            };
        }
        
        // 서비스와 관련 플랜들도 동시에 업데이트
        await adminRepo.updatePricingPlansByService(validServiceId, { is_active: isActive });
        
        const statusText = isActive ? '활성화' : '비활성화';
        
        return {
            success: true,
            message: `${serviceId} 서비스가 ${statusText}되었습니다.`
        };
        
    } catch (error) {
        console.error('서비스 상태 변경 오류:', error);
        return {
            success: false,
            error: 'INTERNAL_ERROR',
            message: '서비스 상태 변경에 실패했습니다.'
        };
    }
}

// 플랜 활성화/비활성화 토글
export async function togglePlan(serviceId, planId, isActive) {
    try {
        // service_id 유효성 검증
        if (!serviceId || isNaN(parseInt(serviceId))) {
            return {
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'service_id는 유효한 숫자여야 합니다.'
            };
        }
        
        // plan_id 유효성 검증
        if (!planId || isNaN(parseInt(planId))) {
            return {
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'plan_id는 유효한 숫자여야 합니다.'
            };
        }
        
        const validServiceId = parseInt(serviceId);
        const validPlanId = parseInt(planId);
        
        const service = await adminRepo.findServiceDefinitionById(validServiceId);
        if (!service) {
            return {
                success: false,
                error: 'NOT_FOUND',
                message: '서비스를 찾을 수 없습니다.'
            };
        }
        
        const plan = await adminRepo.findPricingPlanById(validPlanId);
                
        if (!plan) {
            return {
                success: false,
                error: 'NOT_FOUND',
                message: '플랜을 찾을 수 없습니다.'
            };
        }
        
        await adminRepo.updatePricingPlan(plan.id, { is_active: isActive, updated_at: new Date() });
        
        const statusText = isActive ? '활성화' : '비활성화';
        
        return {
            success: true,
            message: `${serviceId}의 ${planId} 플랜이 ${statusText}되었습니다.`
        };
        
    } catch (error) {
        console.error('플랜 상태 변경 오류:', error);
        return {
            success: false,
            error: 'INTERNAL_ERROR',
            message: '플랜 상태 변경에 실패했습니다.'
        };
    }
}

// ========== 🔧 헬퍼 함수들 🔧 ==========
// 기존 파일 삭제
export async function deleteOldLogoFile(oldUrl) {
  if (!oldUrl) return;
  
  // 썸네일과 동일한 방식으로 경로 처리
  const basePath = getUploadBasePath();
  const relativePath = oldUrl.replace('/uploads', ''); // '/logo_image/파일명.png'
  const absolutePath = path.resolve(basePath + relativePath); // '/var/www/admin/uploads/logo_image/파일명.png'
  
  console.log('🗑️ 로고 파일 삭제:', absolutePath);
  
  if (fs.existsSync(absolutePath)) {
    await fs.promises.unlink(absolutePath).catch((error) => {
      console.error('로고 파일 삭제 실패:', error.message);
    });
    console.log('✅ 로고 파일 삭제 완료');
  } else {
    console.warn('⚠️ 삭제할 로고 파일이 존재하지 않음:', absolutePath);
  }
}

// 로고 처리: 파일 있으면 교체, keep_logo=false면 삭제
export async function processLogoFile(service, logoFile, keep_logo) {
  const current = service.logo_image || null;

  // 새 파일 업로드가 온 경우
  if (logoFile) {
    // 썸네일과 동일한 방식으로 URL 생성
    const newUrl = `/uploads/logo_image/${logoFile.filename}`;
    if (current && current !== newUrl) await deleteOldLogoFile(current);
    return { logo_image: newUrl, uploaded_at: new Date() };
  }

  // 파일 없이 삭제만 요청
  if (keep_logo === false && current) {
    await deleteOldLogoFile(current);
    return { logo_image: '', uploaded_at: new Date() }; // null 대신 빈 문자열
  }

  return null;
}

// 플랜 검증 및 업데이트 ( 3번 API 에서 사용 )
async function validateAndUpdatePlan(plan) {
    if (!plan.plan_id) return { success: true }; // plan_id가 없으면 스킵
    
    // 유효한 필드명 검증
    const allowedFields = ['plan_id', 'display_title', 'price', 'duration', 'is_active'];
    const receivedFields = Object.keys(plan);
    const invalidFields = receivedFields.filter(field => !allowedFields.includes(field));
    
    console.log('=== validateAndUpdatePlan 검증 ===');
    console.log('allowedFields:', allowedFields);
    console.log('receivedFields:', receivedFields);
    console.log('invalidFields:', invalidFields);
    
    if (invalidFields.length > 0) {
        console.log("유효하지 않은 필드명 발견! invalidFields : ", invalidFields);
        throw new Error(`유효하지 않은 필드명: ${invalidFields.join(', ')}. 허용되는 필드: ${allowedFields.join(', ')}`);
    }
    
    // 구조분해할당은 검증 후에 수행
    const { plan_id, display_title, price, duration, is_active } = plan;
    
    // display_title 유효성 검사 (20자 제한)
    if (display_title && display_title.length > 20) {
        return {
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'display_title은 20자를 초과할 수 없습니다.'
        };
    }    

    const planData = { updated_at: new Date() };
    if (display_title !== undefined) planData.display_title = display_title;
    if (price !== undefined) planData.price = parseInt(price);
    if (duration !== undefined) planData.duration = parseInt(duration);
    if (is_active !== undefined) planData.is_active = is_active;

    console.log(" planData =====: ", planData);

    // 업데이트할 필드가 없으면 (updated_at만 있는 경우) 에러
    if (Object.keys(planData).length === 1) {
        throw new Error('업데이트할 필드가 없습니다.');
    }
    
    const result = await adminRepo.updatePricingPlan(plan_id, planData);
    
    // updatePricingPlan은 boolean을 반환하므로 false면 에러
    if (!result) {
        throw new Error(`플랜 ID ${plan_id}를 찾을 수 없습니다.`);
    }
  

    return { success: true };
}
// 3. 플랜 수정
export async function updateSinglePlan(planData) {
    try {
        console.log('=== updateSinglePlan 시작 ===');
        console.log('입력 데이터:', planData);
        console.log('입력 데이터 필드명:', Object.keys(planData));
        
        // 기존 validateAndUpdatePlan 함수를 재사용
        const result = await validateAndUpdatePlan(planData);
        
        if (!result.success) {
            console.error('플랜 업데이트 실패:', result.message);
            return {
                success: false,
                message: result.message,
                statusCode: 400
            };
        }
        
        console.log('플랜 업데이트 성공');
        return {
            success: true,
            message: '요금설정이 수정되었습니다.'
        };
        
    } catch (error) {
        console.error('updateSinglePlan 오류:', error);
        return {
            success: false,
            message: error.message || '요금설정 수정 중 오류가 발생했습니다.',
            statusCode: 400
        };
    }
}