// Cloudflare Workers entry point. Static files in public/ are served automatically;
// only /api/* requests reach this code. The handlers are shared with Pages and the local server.
import * as game from './functions/api/game.js';
import * as file from './functions/api/file.js';
import * as clipart from './functions/api/clipart.js';
import * as audio from './functions/api/audio.js';
import * as steamSearch from './functions/api/steam-search.js';
import * as spotify from './functions/api/spotify.js';
import * as steamCheck from './functions/api/steam-check.js';
import * as proxy from './functions/api/proxy.js';
import * as youtube from './functions/api/youtube.js';
import * as steamArt from './functions/api/steam-art.js';
import * as steamReview from './functions/api/steam-review.js';
import { json } from './lib/http.js';

const ROUTES = { '/api/game': game, '/api/file': file, '/api/clipart': clipart, '/api/audio': audio, '/api/steam-search': steamSearch, '/api/spotify': spotify, '/api/steam-check': steamCheck, '/api/proxy': proxy, '/api/youtube': youtube, '/api/steam-art': steamArt, '/api/steam-review': steamReview };

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const route = ROUTES[pathname];
    if (!route) return json(404, { error: 'Not found' });
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
    return route.onRequestGet({ request, env });
  },
};
