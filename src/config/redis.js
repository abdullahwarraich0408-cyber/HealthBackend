const Redis = require('ioredis');
const env = require('./env');
const { logger } = require('../utils/logger');

function createMemoryRedis() {
  const store = new Map();
  const expirations = new Map();

  const isExpired = (key) => {
    const expiresAt = expirations.get(key);
    if (!expiresAt) return false;
    if (Date.now() >= expiresAt) {
      store.delete(key);
      expirations.delete(key);
      return true;
    }
    return false;
  };

  const client = {
    get(key) {
      if (isExpired(key)) return Promise.resolve(null);
      return Promise.resolve(store.has(key) ? store.get(key) : null);
    },
    set(key, value, ...args) {
      store.set(key, value);
      const exIndex = args.indexOf('EX');
      if (exIndex !== -1 && args[exIndex + 1] != null) {
        expirations.set(key, Date.now() + Number(args[exIndex + 1]) * 1000);
      } else {
        expirations.delete(key);
      }
      return Promise.resolve('OK');
    },
    del(...keys) {
      keys.forEach((key) => {
        store.delete(key);
        expirations.delete(key);
      });
      return Promise.resolve(keys.length);
    },
    ping() {
      return Promise.resolve('PONG');
    },
    quit() {
      return Promise.resolve();
    },
    disconnect() {},
    on() {
      return client;
    },
  };

  return client;
}

function shouldUseMemoryRedis() {
  if (process.env.REDIS_ENABLED === 'true') return false;
  if (process.env.REDIS_DISABLED === 'true') return true;
  return env.NODE_ENV === 'development';
}

let redisClient;

if (shouldUseMemoryRedis()) {
  redisClient = createMemoryRedis();
  logger.warn('Redis not configured for local dev — using in-memory store. Set REDIS_ENABLED=true when Redis is running.');
} else {
  let loggedError = false;

  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: () => null,
  });

  redisClient.on('error', (err) => {
    if (!loggedError) {
      loggedError = true;
      logger.error(`Redis Error: ${err.message || err}`);
    }
  });

  redisClient.on('connect', () => {
    logger.info('Connected to Redis');
  });

  redisClient.connect().catch((err) => {
    if (!loggedError) {
      loggedError = true;
      logger.error(`Redis Error: ${err.message || err}`);
    }
  });
}

module.exports = redisClient;
