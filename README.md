# nyaasubscribe

A self-hosted Telegram bot that watches [nyaa.si](https://nyaa.si) for new anime episodes from SubsPlease and Erai-raws, and automatically sends new matching episodes to a uTorrent/BitTorrent Web UI compatible downloader.

## Setup

1. Copy `.env.example` to `.env` and fill in your bot token and admin Telegram user id:

   ```
   BOT_TOKEN=your-telegram-bot-token
   ADMIN_ID=your-telegram-user-id
   ```

   These are the only two values configured outside the bot. Everything else (downloader connection, poll interval, subscriptions) is configured through the bot itself and stored in `data/db.json`.

2. Build and run:

   ```bash
   docker compose up --build -d
   ```

3. Open a chat with your bot in Telegram and send `/start`.

## Usage

- **Settings > Configure Downloader**: enter your torrent client's Web UI base URL, username, and password (the same API used by the reference magnet-downloader page: `/gui/token.html`, `list-dirs`, `add-url`). Pick a default download directory.
- **Settings > Poll Interval**: how often (in minutes) the bot checks nyaa.si for new episodes. Takes effect on the next poll cycle, no restart needed.
- **Add Subscription**: type the exact release title (for example `Mushoku Tensei S3`), choose a provider (SubsPlease or Erai-raws) and a resolution (480p, 720p, 1080p). Only releases from trusted uploaders matching all three are auto-downloaded.
- **Subscriptions**: list and remove existing subscriptions.

The bot is restricted to the Telegram user id in `ADMIN_ID`; all other users are ignored.

## Development

```bash
npm install
npm run typecheck
npm run dev        # run directly with tsx
npm run build      # bundle + minify to dist/bot.js (what the Docker image runs)
```

## Data

`data/` is mounted into the container at `/data` and holds `db.json` (settings + subscriptions). Back it up if you want to preserve subscriptions across reinstalls.
