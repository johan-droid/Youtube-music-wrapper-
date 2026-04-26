/**
 * YouTube Music Wrapper Microservice
 * Extracts audio URLs from YouTube Music/YouTube for Telegram bot
 * Deploy to Render to bypass Heroku IP blocks
 */

const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// yt-dlp options for youtube-dl-exec
const YTDLP_OPTIONS = {
  noWarnings: true,
  noCallHome: true,
  preferFreeFormats: true,
  youtubeSkipDashManifest: true,
  referer: 'https://www.youtube.com/',
  addHeader: [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language: en-US,en;q=0.9',
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  ]
};

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
 * Search YouTube Music
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

    // Use youtube-dl-exec to search
    const searchQuery = `ytsearch${limit}:${query}`;

    try {
      const result = await youtubedl(searchQuery, {
        ...YTDLP_OPTIONS,
        flatPlaylist: true,
        dumpSingleJson: true
      });

      const results = [];
      const entries = result.entries || [];

      for (const entry of entries) {
        if (entry.id && entry.title) {
          results.push({
            id: entry.id,
            title: entry.title,
            artist: entry.uploader || entry.channel || 'Unknown Artist',
            duration: entry.duration || 0,
            thumbnail: entry.thumbnail || `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${entry.id}`
          });
        }
      }

      console.log(`[SEARCH] Found ${results.length} results`);

      res.json({
        data: results,
        total: results.length,
        query: query
      });

    } catch (execError) {
      console.error('[SEARCH] yt-dlp error:', execError.message);
      res.status(500).json({
        error: 'Search failed',
        message: execError.message,
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
 * Get track stream URL
 * GET /track/:id
 */
app.get('/track/:id', async (req, res) => {
  try {
    const videoId = req.params.id;

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    console.log(`[TRACK] ID: ${videoId}`);

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
      // Get video info with audio URL
      const result = await youtubedl(videoUrl, {
        ...YTDLP_OPTIONS,
        dumpSingleJson: true,
        format: 'bestaudio[ext=m4a]/bestaudio/best'
      });

      const title = result.title || 'Unknown';
      const artist = result.uploader || result.channel || 'Unknown Artist';
      const duration = result.duration || 0;
      const thumbnail = result.thumbnail || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

      // Get the audio URL
      let streamUrl = null;
      if (result.url) {
        streamUrl = result.url;
      } else if (result.formats && result.formats.length > 0) {
        // Find best audio format
        const audioFormats = result.formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
        if (audioFormats.length > 0) {
          audioFormats.sort((a, b) => (b.tbr || 0) - (a.tbr || 0));
          streamUrl = audioFormats[0].url;
        } else if (result.formats.length > 0) {
          streamUrl = result.formats[0].url;
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
        url: videoUrl,
        thumbnail: thumbnail,
        source: 'youtube'
      });

    } catch (execError) {
      console.error('[TRACK] yt-dlp error:', execError.message);
      res.status(500).json({
        error: 'Extraction failed',
        message: execError.message
      });
    }

  } catch (error) {
    console.error('[TRACK] Error:', error.message);

    // Check for specific errors
    if (error.message.includes('Video unavailable')) {
      return res.status(404).json({ error: 'Video unavailable or private' });
    }
    if (error.message.includes('Sign in')) {
      return res.status(403).json({ error: 'Age restricted - requires sign in' });
    }

    res.status(500).json({
      error: 'Extraction failed',
      message: error.message
    });
  }
});

/**
 * Extract from full URL
 * GET /extract?url=<youtube_url>
 */
app.get('/extract', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'Missing URL parameter' });
    }

    console.log(`[EXTRACT] URL: ${url}`);

    try {
      // Get video info with audio URL
      const result = await youtubedl(url, {
        ...YTDLP_OPTIONS,
        dumpSingleJson: true,
        format: 'bestaudio[ext=m4a]/bestaudio/best'
      });

      // Get the audio URL
      let streamUrl = null;
      if (result.url) {
        streamUrl = result.url;
      } else if (result.formats && result.formats.length > 0) {
        const audioFormats = result.formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
        if (audioFormats.length > 0) {
          audioFormats.sort((a, b) => (b.tbr || 0) - (a.tbr || 0));
          streamUrl = audioFormats[0].url;
        } else if (result.formats.length > 0) {
          streamUrl = result.formats[0].url;
        }
      }

      if (!streamUrl) {
        return res.status(404).json({ error: 'Could not extract stream URL' });
      }

      res.json({
        id: result.id,
        title: result.title || 'Unknown',
        artist: { name: result.uploader || 'Unknown Artist' },
        duration: result.duration || 0,
        stream_url: streamUrl,
        url: url,
        thumbnail: result.thumbnail || '',
        source: 'youtube'
      });

    } catch (execError) {
      console.error('[EXTRACT] yt-dlp error:', execError.message);
      res.status(500).json({
        error: 'Extraction failed',
        message: execError.message
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
