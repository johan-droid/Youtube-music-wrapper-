# YouTube Music Wrapper

A lightweight microservice that extracts audio URLs from YouTube Music/YouTube using the **Invidious API**.

**Purpose:** Bypass YouTube bot detection by using Invidious instances (YouTube frontends) instead of direct yt-dlp.

## How It Works

Instead of using yt-dlp (which gets blocked by YouTube), this wrapper uses public Invidious instances:
- Invidious is a privacy-friendly YouTube frontend
- Provides JSON API for search and video info
- Returns direct audio stream URLs
- Bypasses YouTube's bot detection entirely

## Deploy to Render

### Option 1: Deploy from GitHub (Recommended)

1. Push this code to a GitHub repository
2. Go to [Render Dashboard](https://dashboard.render.com/)
3. Click "New Web Service"
4. Connect your GitHub repository
5. Configure:
   - **Name:** `youtube-music-wrapper`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
6. Click "Create Web Service"

### Option 2: Deploy via Render YAML

1. Push this code to GitHub with `render.yaml`
2. Click "New" → "Blueprint" in Render dashboard
3. Connect your repo
4. Render will auto-configure from `render.yaml`

## API Endpoints

### Health Check
```
GET /
```
Response:
```json
{
  "status": "healthy",
  "service": "youtube-music-wrapper",
  "version": "1.0.0"
}
```

### Search
```
GET /search?q=<query>&limit=<n>
```
Example:
```bash
curl "https://your-service.onrender.com/search?q=mei+hun+yahaan&limit=5"
```

Response:
```json
{
  "data": [
    {
      "id": "dQw4w9WgXcQ",
      "title": "Song Title",
      "artist": "Artist Name",
      "duration": 213,
      "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    }
  ],
  "total": 1,
  "query": "mei hun yahaan"
}
```

### Get Track Stream URL
```
GET /track/:video_id
```
Example:
```bash
curl "https://your-service.onrender.com/track/dQw4w9WgXcQ"
```

Response:
```json
{
  "id": "dQw4w9WgXcQ",
  "title": "Song Title",
  "artist": { "name": "Artist Name" },
  "duration": 213,
  "stream_url": "https://rr2---sn-...googlevideo.com/...",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
  "source": "youtube"
}
```

### Extract from URL
```
GET /extract?url=<youtube_url>
```
Example:
```bash
curl "https://your-service.onrender.com/extract?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## Configure Your Bot

Once deployed, add this environment variable to your Heroku bot:

```bash
heroku config:set YOUTUBE_API_BASE_URL=https://your-service.onrender.com -a resumedia
```

## Local Development

```bash
# Install dependencies
npm install

# Install yt-dlp
pip install -r requirements.txt

# Run locally
npm run dev
```

## Testing

```bash
# Search
curl "http://localhost:3000/search?q=test&limit=3"

# Get track
curl "http://localhost:3000/track/dQw4w9WgXcQ"
```

## Troubleshooting

**Invidious instance down:**
- The wrapper automatically rotates through multiple Invidious instances
- If all fail, the service will return 500 - try again later

**Video unavailable:**
- Some videos are geo-blocked or age-restricted on Invidious too
- Try different search queries

**No audio URL in response:**
- Some Invidious instances don't provide adaptiveFormats
- The wrapper will return `null` for stream_url in these cases

## How Invidious Works

This service uses the Invidious API:
```
Your Bot → This Wrapper → Invidious Instance → YouTube
                              (bypasses blocks)
```

Multiple Invidious instances are used for redundancy:
- iv.datura.network
- iv.nboeck.de
- iv.melmac.space
- y.com.sb
- yt.artemislena.eu

## License

MIT
