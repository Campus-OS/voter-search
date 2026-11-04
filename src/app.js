const path = require('node:path');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const apiRouter = require('./routes/api');
const config = require('./config');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.NODE_ENV === 'production' ? 1 : false);
app.use(pinoHttp({
  redact: ['req.headers.x-vote-key'],
  serializers: { req: (req) => ({ id: req.id, method: req.method }) },
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: '16kb', strict: true }));
app.use('/api', apiRouter);
app.use(express.static(path.join(__dirname, '..', 'public'), {
  index: 'index.html',
  maxAge: 0,
  setHeaders(res, filePath) {
    if (/\.(?:html|css|js)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-store');
  },
}));

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((error, req, res, next) => {
  req.log.error({ err: error }, 'Request failed');
  if (res.headersSent) return next(error);
  const status = error.status === 413 ? 413 : 500;
  return res.status(status).json({ error: status === 413 ? 'Request body is too large.' : 'An unexpected server error occurred.' });
});

module.exports = app;
