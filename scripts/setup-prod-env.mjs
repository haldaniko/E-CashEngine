import crypto from 'crypto';
import fs from 'fs';

const file = '.env.production';
if (fs.existsSync(file)) {
  console.log(`${file} already exists; leaving it unchanged.`);
} else {
  const secret = () => crypto.randomBytes(32).toString('base64url');
  const content = `POSTGRES_DB=ecashengine
POSTGRES_USER=ecashengine
POSTGRES_PASSWORD=${secret()}
VITE_API_URL=https://e-cashingengine.com
`;

  fs.writeFileSync(file, content, { mode: 0o600 });
  console.log(`${file} created. Review domains before production deploy.`);
}

const secret = () => crypto.randomBytes(32).toString('base64url');
const backendFile = 'backend/.env.production';
if (!fs.existsSync(backendFile)) {
  const backendContent = `NODE_ENV=production
PORT=4000
REDIS_URL=redis://redis:6379
CORS_ORIGIN=https://e-cashingengine.com
SITE_URL=https://e-cashingengine.com
BOT_INTEGRATION_TOKEN=${secret()}
JWT_SECRET=${secret()}
REFRESH_TOKEN_SECRET=${secret()}
OPENROUTER_API_KEY=
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct
OPENROUTER_SITE_URL=https://e-cashingengine.com
OPENROUTER_TIMEOUT_MS=45000
OPENROUTER_MAX_INPUT_CHARS=8000
OPENROUTER_MAX_OUTPUT_TOKENS=1800
OPENROUTER_TEMPERATURE=0.6
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
`;
  fs.writeFileSync(backendFile, backendContent, { mode: 0o600 });
  console.log(`${backendFile} created. Keep JWT_SECRET and REFRESH_TOKEN_SECRET stable.`);
}
