import * as pricingRepo from '../repositories/pricing.repository.js';

// 홈페이지용 활성화된 요금설정 조회
export async function getHomepagePricing(req, res) {
  try {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);

    const { lang = 'kor' } = req.query;

    // lang 유효성 검증
    if (!['kor', 'eng'].includes(lang)) {
      return res.status(400).json({
        success: false,
        message: 'lang 매개변수는 "kor" 또는 "eng"만 허용됩니다.'
      });
    }

    const result = await pricingRepo.findActiveServices(lang);

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        message: '활성화된 서비스가 없습니다.'
      });
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('홈페이지 요금설정 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '홈페이지 요금설정 조회에 실패했습니다.'
    });
  }
}