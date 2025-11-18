# CAHTS - Confidence-Aware Hierarchical Transcription System

A production-ready audio transcription system that combines the speed of Faster-Whisper with the semantic reasoning of Qwen2-Audio to deliver high-fidelity transcriptions. The system identifies low-confidence segments and surgically corrects them using a multimodal LLM.

## Features

- **Hierarchical Transcription Pipeline**: Fast initial transcription with Whisper, followed by targeted corrections with Qwen2-Audio
- **User Authentication**: Secure registration and login with bcrypt password hashing
- **Per-User Configuration**: Each user can provide their own Discord webhook URL for notifications
- **Job Queue System**: SQLite-based job queue with atomic job claiming and WAL mode
- **Real-Time Updates**: React Query polling for live job status updates
- **Discord Notifications**: Rich embeds sent when jobs start, complete, or fail
- **Docker Orchestration**: Complete containerized deployment with Docker Compose
- **Test-Driven Development**: Comprehensive test suite with Vitest

## Architecture

The system consists of several key components:

1. **Next.js Application**: Web UI and API endpoints
2. **Background Worker**: Processes transcription jobs from the queue
3. **Health Monitor**: Monitors system health and sends Discord alerts
4. **Nginx Proxy Manager**: SSL termination and reverse proxy
5. **Faster-Whisper Server**: External ASR service (running on host)
6. **Qwen2-Audio Server**: Containerized multimodal LLM (vLLM)
7. **SQLite Database**: Job queue and user data

### Health Monitoring

The system includes automated health monitoring with Discord notifications:

- **Automatic Health Checks**: Monitors database, Whisper API, and Qwen API every 60 seconds
- **Failure Detection**: Alerts after 3 consecutive failures (configurable)
- **Recovery Notifications**: Notifies when services come back online
- **Service Status**: Tracks healthy, degraded, and unhealthy states
- **Response Time Tracking**: Monitors API response times

Health check endpoints:
- `/api/health` - Basic liveness check
- `/api/health/detailed` - Detailed service health with response times

## Prerequisites

### Required

- Docker and Docker Compose
- Node.js 20+ (for local development)
- NVIDIA GPU with CUDA support (for Qwen2-Audio)
- nvidia-docker2 runtime
- Faster-Whisper server running on host at port 62277

### Optional

- Discord webhook URL for notifications

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd second-opinion-transcription
```

### 2. Configure Environment

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

**Important environment variables:**

```env
# Database
DATABASE_URL="file:./dev.db"

# JWT Secret (generate a secure random string)
JWT_SECRET="your-super-secret-jwt-key-change-this"

# Whisper Server (external, on host)
WHISPER_API_URL="http://host.docker.internal:62277"

# Qwen2-Audio Server (Docker internal)
QWEN_API_URL="http://qwen2-audio:8000"

# Discord Webhook (optional - users can override per-user)
DEFAULT_DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."

# Transcription Settings
CONFIDENCE_THRESHOLD="0.60"
CLUSTERING_PROXIMITY_SECONDS="5"
CORRECTION_WINDOW_SECONDS="20"

# File Upload Settings
MAX_FILE_SIZE_MB="500"
UPLOAD_DIR="./uploads"

# Worker Settings
WORKER_POLL_INTERVAL_MS="3000"

# Health Monitoring Settings
HEALTH_CHECK_INTERVAL_SECONDS="60"
HEALTH_CHECK_TIMEOUT_SECONDS="10"
HEALTH_CHECK_FAILURE_THRESHOLD="3"
HEALTH_DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

### 3. Start Faster-Whisper Server (External)

**CRITICAL:** You must have a Faster-Whisper server running on your host machine at port 62277.

Follow the instructions at: https://github.com/SYSTRAN/faster-whisper

Example:

```bash
# Install faster-whisper-server
pip install faster-whisper-server

# Start the server
faster-whisper-server --port 62277 --model large-v3
```

### 4. Build and Start the Services

```bash
# Install dependencies (for local development)
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Start all services with Docker Compose
docker-compose up -d --build
```

This will start:
- Next.js application (port 3000)
- Background worker
- Health monitoring service
- Nginx Proxy Manager (ports 80, 443, 81)
- Qwen2-Audio vLLM server

### 5. Configure Nginx Proxy Manager (Optional but Recommended)

1. Access NPM admin UI at `http://localhost:81`
2. Default login: `admin@example.com` / `changeme`
3. Change your password immediately
4. Create a Proxy Host:
   - Domain: `transcription.yourdomain.com`
   - Forward Hostname: `app`
   - Forward Port: `3000`
   - Enable SSL with Let's Encrypt

### 6. Access the Application

- Development: `http://localhost:3000`
- Production (with NPM): `https://transcription.yourdomain.com`

## Usage

### 1. Register an Account

Navigate to `/register` and create an account with:
- Email
- Password (min 8 chars, uppercase, lowercase, number)
- Name (optional)
- Discord Webhook URL (optional - for per-user notifications)

### 2. Upload Audio File

From the dashboard:
1. Click "Upload Audio File"
2. Select an audio file (MP3, WAV, M4A, OGG, WebM)
3. Click "Upload & Transcribe"

The system will return a Job ID immediately.

### 3. Monitor Progress

The job list automatically polls every 5 seconds to show:
- **PENDING**: Job in queue
- **PROCESSING**: Currently transcribing
- **COMPLETED**: Finished successfully
- **FAILED**: Error occurred

### 4. View Results

Once completed:
- Click "Show Transcript" to view the final transcript
- Click "Copy to Clipboard" to copy the text
- Click "Download" to save as a text file

### 5. Configure Settings

From the dashboard:
- Click "Settings"
- Update your name
- Add/change your Discord webhook URL
- Save changes

## Development

### Local Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Start Next.js dev server
npm run dev

# Start worker (in separate terminal)
npm run worker
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

### Database Management

```bash
# Open Prisma Studio (database GUI)
npm run prisma:studio

# Create a new migration
npx prisma migrate dev --name your_migration_name

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

## System Architecture

### Transcription Pipeline

1. **User uploads audio file** → Stored in `uploads/` directory, job created with status PENDING
2. **Worker claims job** → Atomically updates status to PROCESSING
3. **Whisper transcription** → Extracts word-level confidence scores
4. **Clustering** → Groups low-confidence words (<60%) within 5-second windows
5. **FFmpeg extraction** → Creates 20-second audio clips around low-confidence regions
6. **Qwen2 correction** → Multimodal LLM corrects each clip
7. **Reconciliation** → Merges corrections back into master transcript using Levenshtein distance
8. **Completion** → Updates job with final transcript, sends Discord notification

### Database Schema

**User**
- id, email, passwordHash, name, discordWebhookUrl

**Job**
- id, userId, status, originalAudioPath, originalFileName, transcript, processingStarted, processingEnded, errorMessage

**Segment**
- id, jobId, word, start, end, confidence

**Correction**
- id, segmentId, originalText, correctedText, triggerConfidence, audioClipPath, clipStart, clipEnd, levenshteinDistance

## Configuration

### Confidence Threshold

Default: `0.60` (60%)

Words with confidence below this threshold trigger correction.

```env
CONFIDENCE_THRESHOLD="0.60"
```

### Clustering Proximity

Default: `5` seconds

Low-confidence words within this time window are grouped into a single cluster.

```env
CLUSTERING_PROXIMITY_SECONDS="5"
```

### Correction Window

Default: `20` seconds

Duration of audio clips sent to Qwen2-Audio for correction.

```env
CORRECTION_WINDOW_SECONDS="20"
```

### Health Monitoring Configuration

**Check Interval**

Default: `60` seconds

How often the health monitor checks all services.

```env
HEALTH_CHECK_INTERVAL_SECONDS="60"
```

**Timeout**

Default: `10` seconds

Maximum time to wait for each health check response.

```env
HEALTH_CHECK_TIMEOUT_SECONDS="10"
```

**Failure Threshold**

Default: `3` consecutive failures

Number of consecutive failures before sending a Discord alert.

```env
HEALTH_CHECK_FAILURE_THRESHOLD="3"
```

**Discord Webhook for Health Alerts**

Optional: Separate webhook for health monitoring alerts (falls back to DEFAULT_DISCORD_WEBHOOK_URL).

```env
HEALTH_DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

## Troubleshooting

### Cannot connect to Whisper server

**Error:** `Whisper API error: ECONNREFUSED`

**Solution:** Ensure Faster-Whisper server is running on the host at port 62277:

```bash
# Test connection
curl http://localhost:62277/health
```

### Qwen2-Audio out of memory

**Error:** `CUDA out of memory`

**Solution:**
1. Reduce `shm_size` in `docker-compose.yml`
2. Use a smaller model (e.g., `Qwen/Qwen2-Audio-7B-Instruct-Int4`)
3. Ensure GPU has at least 16GB VRAM

### Worker not processing jobs

**Check worker logs:**

```bash
docker logs -f cahts-worker
```

**Common issues:**
- Database locked → Check WAL mode is enabled
- FFmpeg not found → Ensure ffmpeg is installed in Docker image
- Permission errors → Check upload directory permissions

### FFmpeg extraction fails

**Error:** `FFmpeg extraction error`

**Solution:**
- Ensure input audio file is valid
- Check disk space in upload directory
- Verify ffmpeg installation: `docker exec cahts-app which ffmpeg`

## Security Considerations

- Passwords are hashed with bcrypt (cost factor 12)
- JWT tokens expire after 7 days
- Session cookies are httpOnly and secure (in production)
- File uploads are validated by type and size
- User data is isolated (users can only access their own jobs)
- Environment variables are used for all secrets

## Performance

- SQLite WAL mode for concurrent reads/writes
- React Query with smart polling (pauses when window not focused)
- Atomic job claiming prevents duplicate processing
- FFmpeg uses accurate seeking for precise timestamps
- Clustering algorithm minimizes Qwen2 API calls

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Acknowledgments

- Based on the architectural principles from "Architectural Blueprint for High-Fidelity Hierarchical Audio Transcription Systems"
- Faster-Whisper: SYSTRAN/faster-whisper
- Qwen2-Audio: Alibaba Cloud
- vLLM: vllm-project/vllm
- Next.js: Vercel
- Nginx Proxy Manager: jc21/nginx-proxy-manager

## Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Documentation: See `docs/` directory

---

**Built with ❤️ for high-fidelity audio transcription**
