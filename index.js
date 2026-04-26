/**
 * YouTube Music Wrapper Microservice
 * Uses Invidious API to bypass YouTube bot detection
 * Deploy to Render to bypass Heroku IP blocks
 */

const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Invidious instances - these are YouTube frontends that don't block
const INVIDIOUS_INSTANCES = [
  'https://iv.datura.network',
  'https://iv.nboeck.de',
  'https://iv.melmac.space',
  'https://iv.nboeck.de',
  'https://y.com.sb',
  'https://yt.artemislena.eu'
];

let currentInstanceIndex = 0;

function getInvidiousUrl(path) {
  const instance = INVIDIOUS_INSTANCES[currentInstanceIndex];
  currentInstanceIndex = (currentInstanceIndex + 1) % INVIDIOUS_INSTANCES.length;
  return `${instance}${path}`;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 15000
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            resolve(JSON.parse(data));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'youtube-music-wrapper',
    version: '1.0.0'
  });
});

/**
 * Search YouTube Music via Invidious API
 * GET /search?q=<query>&limit=<n>
 */
app.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    const limit = parseInt(req.query.limit) || 5;

    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter' });
    }

    console.log(`[SEARCH] Query: "${query}", Limit: ${limit}`);

    try {
      // Use Invidious API to search (bypasses YouTube bot detection)
      const searchUrl = getInvidiousUrl(`/api/v1/search?q=${encodeURIComponent(query)}&type=video`);
      const data = await fetchJson(searchUrl);

      const results = [];
      const entries = Array.isArray(data) ? data : [];

      for (let i = 0; i < Math.min(entries.length, limit); i++) {
        const entry = entries[i];
        if (!entry.videoId || !entry.title) continue;

        // Get best audio stream URL from adaptiveFormats
        let streamUrl = null;
        if (entry.adaptiveFormats && entry.adaptiveFormats.length > 0) {
          const audioFormats = entry.adaptiveFormats.filter(f =>
            f.type && f.type.startsWith('audio/')
          );
          if (audioFormats.length > 0) {
            // Sort by bitrate (highest first)
            audioFormats.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
            streamUrl = audioFormats[0].url;
          }
        }

        results.push({
          id: entry.videoId,
          title: entry.title,
          artist: entry.author || 'Unknown Artist',
          duration: entry.lengthSeconds || 0,
          thumbnail: entry.videoThumbnails ?
            entry.videoThumbnails.find(t => t.quality === 'medium')?.url ||
            entry.videoThumbnails[0]?.url ||
            `https://i.ytimg.com/vi/${entry.videoId}/mqdefault.jpg` :
            `https://i.ytimg.com/vi/${entry.videoId}/mqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${entry.videoId}`,
          stream_url: streamUrl  // Pre-extracted audio URL
        });
      }

      console.log(`[SEARCH] Found ${results.length} results via Invidious`);

      res.json({
        data: results,
        total: results.length,
        query: query
      });

    } catch (apiError) {
      console.error('[SEARCH] Invidious API error:', apiError.message);
      res.status(500).json({
        error: 'Search failed',
        message: apiError.message,
        data: [],
        total: 0
      });
    }

  } catch (error) {
    console.error('[SEARCH] Error:', error.message);
    res.status(500).json({
      error: 'Search failed',
      message: error.message,
      data: [],
      total: 0
    });
  }
});

/**
 * Get track stream URL via Invidious API
 * GET /track/:id
 */
app.get('/track/:id', async (req, res) => {
  try {
    const videoId = req.params.id;

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    console.log(`[TRACK] ID: ${videoId}`);

    try {
      // Use Invidious API to get video info (bypasses YouTube bot detection)
      const infoUrl = getInvidiousUrl(`/api/v1/videos/${videoId}`);
      const result = await fetchJson(infoUrl);

      const title = result.title || 'Unknown';
      const artist = result.author || 'Unknown Artist';
      const duration = result.lengthSeconds || 0;
      const thumbnail = result.videoThumbnails ?
        result.videoThumbnails.find(t => t.quality === 'medium')?.url ||
        result.videoThumbnails[0]?.url ||
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` :
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

      // Get the best audio URL
      let streamUrl = null;
      if (result.adaptiveFormats && result.adaptiveFormats.length > 0) {
        const audioFormats = result.adaptiveFormats.filter(f =>
          f.type && f.type.startsWith('audio/')
        );
        if (audioFormats.length > 0) {
          // Sort by bitrate (highest first)
          audioFormats.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
          streamUrl = audioFormats[0].url;
        }
      }

      if (!streamUrl) {
        return res.status(404).json({ error: 'Could not extract stream URL' });
      }

      console.log(`[TRACK] Success: ${title}`);

      res.json({
        id: videoId,
        title: title,
        artist: { name: artist },
        duration: duration,
        stream_url: streamUrl,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: thumbnail,
        source: 'youtube'
      });

    } catch (apiError) {
      console.error('[TRACK] Invidious API error:', apiError.message);
      res.status(500).json({
        error: 'Extraction failed',
        message: apiError.message
      });
    }

  } catch (error) {
    console.error('[TRACK] Error:', error.message);
    res.status(500).json({
      error: 'Extraction failed',
      message: error.message
    });
  }
});

/**
 * Extract from full URL via Invidious API
 * GET /extract?url=<youtube_url>
 */
app.get('/extract', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'Missing URL parameter' });
    }

    console.log(`[EXTRACT] URL: ${url}`);

    // Extract video ID from URL
    const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (!match) {
      return res.status(400).json({ error: 'Could not extract video ID from URL' });
    }
    const videoId = match[1];

    try {
      // Use Invidious API to get video info
      const infoUrl = getInvidiousUrl(`/api/v1/videos/${videoId}`);
      const result = await fetchJson(infoUrl);

      // Get the best audio URL
      let streamUrl = null;
      if (result.adaptiveFormats && result.adaptiveFormats.length > 0) {
        const audioFormats = result.adaptiveFormats.filter(f =>
          f.type && f.type.startsWith('audio/')
        );
        if (audioFormats.length > 0) {
          audioFormats.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
          streamUrl = audioFormats[0].url;
        }
      }

      if (!streamUrl) {
        return res.status(404).json({ error: 'Could not extract stream URL' });
      }

      res.json({
        id: result.videoId || videoId,
        title: result.title || 'Unknown',
        artist: { name: result.author || 'Unknown Artist' },
        duration: result.lengthSeconds || 0,
        stream_url: streamUrl,
        url: url,
        thumbnail: result.videoThumbnails ?
          result.videoThumbnails.find(t => t.quality === 'medium')?.url ||
          result.videoThumbnails[0]?.url || '' : '',
        source: 'youtube'
      });

    } catch (apiError) {
      console.error('[EXTRACT] Invidious API error:', apiError.message);
      res.status(500).json({
        error: 'Extraction failed',
        message: apiError.message
      });
    }

  } catch (error) {
    console.error('[EXTRACT] Error:', error.message);
    res.status(500).json({
      error: 'Extraction failed',
      message: error.message
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🎵 YouTube Music Wrapper running on port ${PORT}`);
  console.log(`📺 Using youtube-dl-exec with yt-dlp`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET /                    - Health check');
  console.log('  GET /search?q=<query>    - Search YouTube');
  console.log('  GET /track/:id           - Get stream URL by video ID');
  console.log('  GET /extract?url=<url>   - Extract from full URL');
});
