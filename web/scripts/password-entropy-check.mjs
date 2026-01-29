import zxcvbn from 'zxcvbn';
const pw = process.env.PW || '';
const min = parseInt(process.env.MIN_SCORE || '3',10);
const res = zxcvbn(pw);
if (res.score < min) {
  console.error(`Password zxcvbn score ${res.score} below minimum ${min}`);
  process.exit(1);
}
console.log(`zxcvbn score ${res.score} >= ${min} (ok)`);
