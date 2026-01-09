# LP Watcher - RPi Docker Setup

This will run your LP Watcher on your Raspberry Pi 24/7, taking snapshots every hour and displaying them on a beautiful dashboard.

## Prerequisites

Your RPi should have:
- Docker installed
- Docker Compose installed
- Node.js (if not using Docker, which we are)

## Setup on RPi

### 1. Copy files to RPi

```bash
scp -r /Users/umurbasar/dev/lp-watcher umurb@anpsi.local:~/
```

### 2. SSH into RPi

```bash
ssh umurb@anpsi.local
cd lp-watcher
```

### 3. Install dependencies (do this once locally first)

```bash
npm install
```

Or if you're doing it on RPi:
```bash
npm install --only=production
```

### 4. Build and run Docker container

```bash
# Build the image
docker build -t lp-watcher .

# Run with docker-compose
docker-compose up -d
```

Or just Docker:
```bash
docker run -d \
  --name lp-watcher \
  -p 3169:3169 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  lp-watcher
```

### 5. Access the dashboard

Open your browser and go to:
```
http://anpsi.local:3169
```

Or from your Mac:
```
ssh -L 3169:localhost:3169 umurb@anpsi.local
# Then open http://localhost:3169
```

## How it works

- **Server starts** → Takes first snapshot immediately
- **Every hour** → Runs `simple.js` to update the CSV
- **Every 30 seconds** → Web page refreshes to show latest data
- **Data persists** → CSV is stored in `./data/` directory

## Monitoring

### View logs
```bash
docker logs -f lp-watcher
```

### Check data
```bash
cat data/position-history.csv
```

### Stop/Start
```bash
docker-compose down    # Stop
docker-compose up -d   # Start
```

## Updates

If you make changes to `simple.js` or other code:

```bash
docker-compose down
docker build -t lp-watcher .
docker-compose up -d
```

## Troubleshooting

**Port already in use:**
Change port in `docker-compose.yml`:
```yaml
ports:
  - "3170:3169"  # Use 3170 instead
```

**Snapshots not running:**
Check logs: `docker logs lp-watcher`

**CSV not updating:**
Make sure `.env` file has correct RPC_URL and contract addresses

---

That's it! Your dashboard is now running 24/7 on your RPi! 🚀
