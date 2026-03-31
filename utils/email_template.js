export function resetUserPasswordHtml(authString) {
    return `
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9f9f9;">
            <div
                style=" max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                <h1 style="text-align: center; margin-bottom: 0;">아인사이트 임시 비밀번호 발급</h1>
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
                    &copy; Copyright AInsight Corp. All Rights Reserved.
                </p>
            </div>
            </body>
  `
}

