// GET /api/steam-review?url=https://steamcommunity.com/id/<name>/recommended/<appid>
// Copies a public Steam review into the review generator's fields.
import { json } from '../../lib/http.js';
import { parseReviewUrl, parseReviewPage, parseProfileCounts } from '../../lib/steam-review.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  // English text and no age gate on mature games
  Cookie: 'Steam_Language=english; birthtime=0; lastagecheckage=1-0-1970; wants_mature_content=1',
};

async function page(url) {
  const res = await fetch(`${url}?l=english`, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(12000) });
  return { status: res.status, url: res.url, html: res.ok ? await res.text() : '' };
}

export async function onRequestGet({ request }) {
  const link = parseReviewUrl(new URL(request.url).searchParams.get('url'));
  if (!link) {
    return json(400, { error: 'Paste a Steam review link, like https://steamcommunity.com/id/name/recommended/1245620' });
  }

  let review, profile;
  try {
    [review, profile] = await Promise.all([page(link.reviewUrl), page(link.profileUrl).catch(() => null)]);
  } catch (e) {
    return json(502, { error: `Couldn't reach Steam Community: ${e.message}` });
  }
  if (review.status !== 200) return json(502, { error: `Steam Community returned ${review.status}. Try again in a moment.` });

  const data = parseReviewPage(review.html);
  if (!data.text && data.recommended === undefined) {
    // Private profiles and deleted reviews bounce back to the profile or an error page.
    return json(404, { error: 'Couldn’t find a public review at that link. The review may be deleted or the profile private.' });
  }
  if (profile?.html) {
    const counts = parseProfileCounts(profile.html);
    data.products = counts.products;
    data.reviews = counts.reviews;
    // The profile page's link-preview image is always the profile's own picture, so it wins.
    if (counts.avatar) data.avatar = counts.avatar;
  }
  data.appid = link.appid;
  data.url = link.reviewUrl;
  return json(200, data);
}
