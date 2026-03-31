import { AppDataSource_homepage } from '../config/data-sources_homepage.js';
import { AdminPanelPricingPlan } from '../models/admin_panel_pricingplan.entity.js';
import { AdminPanelServiceDefinition } from '../models/admin_panel_servicedefinition.entity.js';
import path from 'path';

const pricingPlanRepository = AppDataSource_homepage.getRepository(AdminPanelPricingPlan);
const serviceDefinitionRepository = AppDataSource_homepage.getRepository(AdminPanelServiceDefinition);

// 활성화된 서비스 조회 (service_active: true, is_active: true)
export async function findActiveServices(lang = 'kor') {
  try {
    // 모든 서비스 정의 조회
    const allServices = await serviceDefinitionRepository.find();

    const result = [];

    for (const service of allServices) {
      // 해당 서비스의 활성화된 플랜 조회
      const queryBuilder = pricingPlanRepository.createQueryBuilder('plan')
        .where('plan.service_id = :serviceId', { serviceId: parseInt(service.id) })
        .andWhere('plan.is_active = :isActive', { isActive: true })
        .andWhere('plan.type NOT IN (:...excludedTypes)', { excludedTypes: [0] });

      // 언어별 ID 필터링: kor(한국어) = id <= 2000, eng(영어) = id >= 2000
      if (lang === 'kor') {
        queryBuilder.andWhere('plan.id <= :maxId', { maxId: 2000 });
      } else if (lang === 'eng') {
        queryBuilder.andWhere('plan.id >= :minId', { minId: 2000 });
      }

      const activePlans = await queryBuilder
        .orderBy('type', 'ASC')
        .addOrderBy('plan.id', 'ASC')
        .getMany();

      // 활성화된 플랜이 있는 서비스만 포함
      if (activePlans.length > 0) {
        const logoImagePath = service.logo_image ? service.logo_image : null;
        const logoName = logoImagePath ? path.basename(logoImagePath) : null;

        result.push({
          service_id: parseInt(service.id),
          name: service.name,
          logoImagePath: logoImagePath,
          logo_name: logoName,
          description: service.description,
          description_eng: service.description_eng || null,
          updated_at: service.uploaded_at,
          service_active: true,
          pricingplan: activePlans.map(plan => ({
            type: plan.type,
            plan_id: String(plan.id),
            name: plan.name,
            price: parseInt(plan.price),
            duration: plan.duration,
            display_title: plan.display_title,
            is_active: true,
            updated_at: plan.updated_at
          }))
        });
      }
    }

    return result.sort((a, b) => a.service_id - b.service_id);
  } catch (error) {
    console.error('활성화된 서비스 조회 오류:', error);
    throw error;
  }
}