import bcrypt from 'bcrypt';
import crypto from 'crypto';

export function generateTempPassword() {
  const length = 8;
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+[]{}|;:,.<>?';
  const allWithoutSpecial = upper + lower + numbers;

  // 최소 구성: 대문자, 소문자, 숫자, 특수문자(1개)
  let password = [
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    numbers[crypto.randomInt(0, numbers.length)],
    special[crypto.randomInt(0, special.length)]
  ];

  // 나머지 4자리는 특수문자를 제외한 문자로만 채움
  for (let i = password.length; i < length; i++) {
    password.push(allWithoutSpecial[crypto.randomInt(0, allWithoutSpecial.length)]);
  }

  // 순서 랜덤 섞기
  for (let i = password.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join('');
}