const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const { logger } = require('../utils/logger');

const MIGRATION_FILE = path.join(
  __dirname,
  '../../prisma/migrations/20250625100000_firebase_auth/migration.sql',
);

async function ensureAuthSchema() {
  if (!fs.existsSync(MIGRATION_FILE)) {
    return;
  }

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const statements = sql
    .split(';')
    .map((part) => part.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);

  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(`${statement};`);
    } catch (err) {
      const message = err?.message || String(err);
      if (/already exists|duplicate column|42701|42P07/i.test(message)) {
        continue;
      }
      logger.warn(`Auth schema bootstrap skipped statement: ${message}`);
    }
  }

  logger.info('Auth schema bootstrap complete');
}

module.exports = { ensureAuthSchema };
