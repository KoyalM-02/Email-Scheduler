import { Client } from '@elastic/elasticsearch';
import { env } from './env.js';

export const elastic = new Client({ 
  node: env.ELASTICSEARCH_NODE,
  auth: env.ELASTICSEARCH_API_KEY ? { apiKey: env.ELASTICSEARCH_API_KEY } : undefined,
});