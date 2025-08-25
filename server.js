const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const PUBLIC_BASE_ORIGIN = process.env.PUBLIC_BASE_ORIGIN || 'https://muvi.com';
const SOURCE_BASE_ORIGIN = process.env.SOURCE_BASE_ORIGIN || 'https://flixtake.de';
const SOURCE_BASE_PATH = process.env.SOURCE_BASE_PATH || '/muvi';
const MUVI_IFRAME_GATE_SECRET = process.env.MUVI_IFRAME_GATE_SECRET || 'change_me_super_secret';
const TOKEN_TTL_SECONDS = parseInt(process.env.TOKEN_TTL_SECONDS, 10) || 30;
const PORT = process.env.PORT || 3000;

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createToken(path) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const data = `${path}|${exp}`;
  const sig = crypto.createHmac('sha256', MUVI_IFRAME_GATE_SECRET).update(data).digest('hex');
  const payload = `${exp}.${sig}`;
  return base64url(payload);
}

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: ["'self'", SOURCE_BASE_ORIGIN],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

app.get('/gate/token', (req, res) => {
  let reqPath = req.query.path || '';
  if (typeof reqPath !== 'string') {
    return res.status(400).json({ error: 'invalid path' });
  }
  if (!reqPath.startsWith('/')) reqPath = '/' + reqPath;
  let fullPath = reqPath.toLowerCase().startsWith(SOURCE_BASE_PATH.toLowerCase()) ? reqPath : SOURCE_BASE_PATH + reqPath;
  fullPath = path.posix.normalize(fullPath);
  if (!fullPath.startsWith(SOURCE_BASE_PATH)) {
    return res.status(400).json({ error: 'invalid path' });
  }
  const token = createToken(fullPath);
  res.json({ token, path: fullPath });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`muvi-proxy listening on port ${PORT}`);
});
