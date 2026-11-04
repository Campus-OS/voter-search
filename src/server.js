require('dotenv').config();
const mongoose = require('mongoose');
const config = require('./config');
const app = require('./app');
const { seedDeviceAccessKeys } = require('./services/device-access');

let server;
let isShuttingDown = false;

async function start() {
  await mongoose.connect(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: config.NODE_ENV !== 'production',
    dbName: config.MONGODB_DB,
  });
  app.locals.deviceAccessEnabled = (await seedDeviceAccessKeys()) > 0;
  app.locals.mongoReady = true;
  server = app.listen(config.PORT, config.HOST, () => {
    console.info(`Voter search listening on ${config.HOST}:${config.PORT}`);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.info(`${signal} received; shutting down`);
  app.locals.mongoReady = false;
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exitCode = 1;
});

start().catch((error) => {
  console.error('Unable to start voter search:', error.message);
  process.exit(1);
});
