# nyaasubscribe

A Telegram bot that watches nyaa.si for new anime episodes from SubsPlease and Erai-raws, and auto-downloads new episodes for your subscriptions.

## Setup

1. Copy `.env.example` to `.env` and fill in your bot token and Telegram user id:

   ```
   BOT_TOKEN=your-telegram-bot-token
   ADMIN_ID=your-telegram-user-id
   ```

2. Run it:

   ```bash
   docker compose up --build -d
   ```

3. Message your bot `/start` in Telegram.

Everything else (downloader connection, poll interval, subscriptions) is configured through the bot itself, and stored in `data/db.json`.

## Usage

- Settings: connect your torrent client's Web UI and set how often the bot polls nyaa.si.
- Add Subscription: enter the exact release title, pick a provider and a resolution.
- Subscriptions: view or remove existing subscriptions.

Only the Telegram user in `ADMIN_ID` can use the bot.

## Development

```bash
npm install
npm run dev      # run with tsx
npm run build    # bundle to dist/bot.js
```
