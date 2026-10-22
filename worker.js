// Cloudflare Workers entry point. Static files in public/ are served automatically;
// only /api/* requests reach this code. The handlers are shared with Pages and the local server.
import * as game from './functions/api/game.js';
import * as file from './functions/api/file.js';
import { json } from './lib/http.js';

const ROUTES = { '/api/game': game, '/api/file': file };

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const route = ROUTES[pathname];
    if (!route) return json(404, { error: 'Not found' });
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
    return route.onRequestGet({ request });
  },
};
