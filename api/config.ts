import { publicConfig } from '../apps/server/snapshot';
export const GET = () => Response.json(publicConfig(), { headers: { 'cache-control': 'public, s-maxage=300' } });
