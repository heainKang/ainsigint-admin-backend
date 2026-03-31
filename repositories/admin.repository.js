import { db_admin } from "../config/db_admin.js";
import { AppDataSource_admin } from "../config/data-sources_admin.js";
import { AppDataSource_homepage } from "../config/data-sources_homepage.js";
import { admin } from '../models/admin.entity.js';
import { PostFile } from '../models/posts/postFile.entity.js';
import { AdminPanelPricingPlan } from '../models/admin_panel_pricingplan.entity.js';
import { AdminPanelServiceDefinition } from '../models/admin_panel_servicedefinition.entity.js';
import bcrypt from 'bcrypt';
import { Not, In } from 'typeorm';

const adminRepository = AppDataSource_admin.getRepository(admin);
const postFileRepository = AppDataSource_admin.getRepository(PostFile);
const pricingPlanRepository = AppDataSource_homepage.getRepository(AdminPanelPricingPlan);
const serviceDefinitionRepository = AppDataSource_homepage.getRepository(AdminPanelServiceDefinition);

export async function create(info) {
    try {
        const { email, password } = info;
        const hashedPassword = bcrypt.hashSync(password, 10);
        const newAdmin = adminRepository.create({
            email: email,
            password: hashedPassword
        });
        const admin = await adminRepository.save(newAdmin);
        

        return admin;    
    } catch(error) {
        console.log("error = ", error);
    }
}

// 관리자 찾기
export async function find(info) {
    try {
        const { email } = info;
        const admin = await adminRepository.findOne({where: {email: email}});

        if(admin) {
            return admin;   
        } else {
            return null;
        }
    } catch(error) {
        console.log("error = ", error);
    }
}

export async function save(admin) {
    try {
        console.log("admin == ", admin);
        
        await adminRepository.save(admin);

        return true;
    } catch(error) {
        console.log("error = ", error);
        return false;
    }
}

/*  게시판 구현  */
// PostFile 관련 함수들
export async function findFilesByPost(type, postId) {
    return await postFileRepository.find({
        where: { 
            type: type, 
            post_id: parseInt(postId) 
        }
    });
}

export async function createFile(fileData) {
    const file = postFileRepository.create(fileData);
    return await postFileRepository.save(file);
}

export async function createFiles(filesData) {
    const files = filesData.map(fileData => postFileRepository.create(fileData));
    return await postFileRepository.save(files);
}

export async function findFileById(files_id, type, postId) {
    return await postFileRepository.findOne({
        where: { 
            id: parseInt(files_id),
            type: type,
            post_id: parseInt(postId)
        }
    });
}

export async function deleteFile(files_id) {
    const result = await postFileRepository.delete(parseInt(files_id));
    return result.affected > 0;
}

export async function deleteFilesByPost(type, postId) {
    const result = await postFileRepository.delete({ 
        type: type, 
        post_id: parseInt(postId) 
    });
    return result.affected > 0;
}

/* BasePost 관련 함수들 - 공통 게시글 CRUD 기능 */
export async function findPostsWithPagination(Entity, { page = 1, limit = 5, title = '', type = '' }) {
    const repository = AppDataSource_admin.getRepository(Entity);
    
    let queryBuilder = repository.createQueryBuilder('post')
        .leftJoin('admin', 'admin', 'admin.email = post.created_by')
        .select([
            'post.id',
            'post.title',
            'post.created_at',
            'admin.name as created_by'
        ])
        .orderBy('post.created_at', 'DESC');

    if (type === 'news') {
        queryBuilder.addSelect('post.thumbnail_url');
    }
    
    if (type === 'paper') {
        queryBuilder.addSelect('post.reference');
    }

    if (title) {
        queryBuilder.where('post.title ILIKE :title', { title: `%${title}%` });
    }

    const total = await queryBuilder.getCount();
    const offset = (page - 1) * limit;
    queryBuilder.offset(offset).limit(parseInt(limit));
    const posts = await queryBuilder.getRawMany();

    const postsWithNumber = posts.map((post, index) => ({
        no: offset + index + 1,
        id: post.post_id,
        title: post.post_title,
        ...(type === 'news' && { thumbnail_url: post.post_thumbnail_url }),
        ...(type === 'paper' && { reference: post.post_reference || '-' }), // null인 경우 '-'로 표시
        created_by: post.created_by || '관리자',
        created_at: post.post_created_at
    }));

    return {
        posts: postsWithNumber,
        total,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit),
            startPage: 1,
            endPage: Math.ceil(total / limit)
        }
    };
}

export async function findPostById(Entity, id, type = '') {
    const repository = AppDataSource_admin.getRepository(Entity);
    
    const queryBuilder = repository.createQueryBuilder('post')
        .leftJoin('admin', 'admin', 'admin.email = post.created_by')
        .addSelect('admin.name', 'created_by')
        .where('post.id = :id', { id: parseInt(id) });

    const post = await queryBuilder.getRawOne();
    
    if (!post) {
        return null;
    }

    const result = {
        id: post.post_id,
        title: post.post_title,
        content: post.post_content,
        created_by: post.created_by || '관리자',
        created_at: post.post_created_at
    };

    // 게시판 타입별 추가 필드
    if (type === 'news') {
        result.thumbnail_url = post.post_thumbnail_url || null;
        result.thumbnail_original_name = post.post_thumbnail_original_name || null;
    }
    if (type === 'paper') {
        result.reference = post.post_reference || '-'; // null인 경우 '-'로 표시
    }

    return result;
}

export async function createPost(Entity, postData) {
    const repository = AppDataSource_admin.getRepository(Entity);
    const post = repository.create(postData);
    return await repository.save(post);
}

export async function updatePost(Entity, id, updateData) {
    const repository = AppDataSource_admin.getRepository(Entity);
    const result = await repository.update(parseInt(id), updateData);
    return result.affected > 0;
}

export async function deletePost(Entity, id) {
    const repository = AppDataSource_admin.getRepository(Entity);
    const result = await repository.delete(parseInt(id));
    return result.affected > 0;
}

export async function findPostByIdSimple(Entity, id) {
    const repository = AppDataSource_admin.getRepository(Entity);
    return await repository.findOne({ where: { id: parseInt(id) } });
}

// 1. 요금설정 조회 - 서비스 정의 조회 // 4. 서비스 토글(존재유무)
export async function findServiceDefinitionById(id) {
    return await serviceDefinitionRepository.findOne({
        where: { id: parseInt(id) }
    });
}

// 1. 요금설정 조회 - 요금플랜 조회 (언어별 필터링 추가)
export async function findPricingPlansByService(serviceId, lang = 'kor') {
  // 기본 쿼리 빌더 생성
  const queryBuilder = pricingPlanRepository.createQueryBuilder('plan')
    .where('plan.service_id = :serviceId', { serviceId: parseInt(serviceId) })
    .andWhere('plan.type NOT IN (:...excludedTypes)', { excludedTypes: [0] });

  // 언어별 ID 필터링: kor(한국어) = id <= 2000, eng(영어) = id >= 2000
  if (lang === 'kor') {
    queryBuilder.andWhere('plan.id <= :maxId', { maxId: 2000 });
  } else if (lang === 'eng') {
    queryBuilder.andWhere('plan.id >= :minId', { minId: 2000 });
  }

    return await queryBuilder
    .orderBy('type', 'ASC')
    .addOrderBy('plan.id', 'ASC')
    .getMany();
}


// 2. 요금설정 수정 - 서비스 정의 업데이트
export async function updateServiceDefinition(id, updateData) {
    const result = await serviceDefinitionRepository.update(parseInt(id), updateData);
    return result.affected > 0;
}

// 2. 요금설정 수정 - 플랜 단순 업데이트 (단순한 데이터 업데이트만 처리)
export async function updatePricingPlanPartial(planId, fields) {
  const result = await pricingPlanRepository.update({ id: planId }, fields);
  return result;
}



//  5. 플랜 토글 - 플랜 조회
export async function findPricingPlanById(id) {
    return await pricingPlanRepository.findOne({
        where: { id: parseInt(id) }
    });
}

// 3. 개별 플랜 수정 - 플랜 업데이트
export async function updatePricingPlan(id, updateData) {
    // updated_at 자동 추가
    const finalUpdateData = {
        ...updateData,
        updated_at: new Date()
    };
    const result = await pricingPlanRepository.update(parseInt(id), finalUpdateData);
    return result.affected > 0;
}

export async function updatePricingPlansByService(serviceId, updateData) {
    // updated_at 자동 추가
    const finalUpdateData = {
        ...updateData,
        updated_at: new Date()
    };
    const result = await pricingPlanRepository.update(
        { service_id: parseInt(serviceId) }, 
        finalUpdateData
    );
    return result.affected;
}

