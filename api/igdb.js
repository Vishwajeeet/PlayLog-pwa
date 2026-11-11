var cachedToken = null;
var tokenExpiresAt = 0;

function sendError(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json({ error: message });
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;

  var tokenUrl = new URL('https://id.twitch.tv/oauth2/token');
  tokenUrl.searchParams.set('client_id', process.env.IGDB_CLIENT_ID || '');
  tokenUrl.searchParams.set('client_secret', process.env.IGDB_CLIENT_SECRET || '');
  tokenUrl.searchParams.set('grant_type', 'client_credentials');

  var response = await fetch(tokenUrl, { method: 'POST' });
  if (!response.ok) throw new Error('IGDB authentication failed (' + response.status + ').');

  var data = await response.json();
  if (!data.access_token || !data.expires_in) {
    throw new Error('IGDB authentication returned an invalid token response.');
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

function escapeSearch(query) {
  return query.replace(/[\r\n]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function mapGame(game) {
  return {
    igdbId: game.id,
    title: game.name,
    releaseYear: game.first_release_date
      ? String(new Date(game.first_release_date * 1000).getUTCFullYear())
      : '',
    poster: game.cover && game.cover.image_id
      ? 'https://images.igdb.com/igdb/image/upload/t_cover_big/' + game.cover.image_id + '.jpg'
      : null,
    genres: (game.genres || []).map(function(genre) { return genre.name; }).filter(Boolean),
    type: 'game'
  };
}

module.exports = async function(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'Method not allowed.');
  }

  if (!process.env.IGDB_CLIENT_ID || !process.env.IGDB_CLIENT_SECRET) {
    return sendError(res, 500, 'IGDB credentials are not configured on the server.');
  }

  var query = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  var id = typeof req.query.id === 'string' ? req.query.id : '';
  var body;

  if (id) {
    if (!/^\d+$/.test(id)) return sendError(res, 400, 'Invalid game ID.');
    body = 'fields name, first_release_date, cover.image_id, genres.name; where id = ' + id + '; limit 1;';
  } else {
    if (query.length < 2 || query.length > 100) {
      return sendError(res, 400, 'Search must be between 2 and 100 characters.');
    }
    body = 'search "' + escapeSearch(query) + '"; fields name, first_release_date, cover.image_id, genres.name; limit 8;';
  }

  try {
    var accessToken = await getAccessToken();
    var response = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Client-ID': process.env.IGDB_CLIENT_ID,
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'text/plain'
      },
      body: body
    });

    if (!response.ok) {
      return sendError(res, 502, 'IGDB request failed (' + response.status + ').');
    }

    var games = await response.json();
    var results = games.filter(function(game) { return game && game.name; }).map(mapGame);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(id ? (results[0] || null) : { results: results });
  } catch (error) {
    console.error('IGDB API request failed:', error);
    return sendError(res, 502, 'Could not reach IGDB. Please try again.');
  }
};
