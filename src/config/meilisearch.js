const { MeiliSearch } = require('meilisearch');
const env = require('./env');

const client = new MeiliSearch({
  host: env.MEILISEARCH_HOST || 'http://127.0.0.1:7700',
  apiKey: env.MEILISEARCH_API_KEY,
});

module.exports = client;
