# SubscriptionSync

SubscriptionSync is a proof-of-concept web app that imports subscription data from Gmail receipts.
It signs in with Google, scans a curated provider list, parses HTML bodies and PDF attachments,
infers billing cadence across invoice history, and exports JSON aligned to the friend app’s form.

## App Stack

- Next.js 16 App Router frontend and API routes
- NextAuth Google OAuth with `gmail.readonly`
- Gmail API message search and MIME normalization
- Optional OpenAI extraction with a heuristic fallback when no API key is configured
- Optional FastAPI + Docling sidecar for PDF parsing
- Vitest coverage for query building, MIME parsing, inference, and fixture pipelines

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL`.
3. Add `OPENAI_API_KEY` if you want live structured extraction instead of the heuristic fallback.
4. Start the Next.js app:

```bash
npm install
npm run dev
```

## Optional Docling Sidecar

The app can parse PDF attachments through a FastAPI sidecar:

```bash
cd python/docling_service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Point `PDF_PARSER_URL` at that service, for example `http://localhost:8000`.

## Railway Deployment

This repo is prepared to deploy to Railway with the included [Dockerfile](/Users/amir/Desktop/Mehdi/Dockerfile) and [railway.json](/Users/amir/Desktop/Mehdi/railway.json).

### 1. Create the Railway service

1. Push this repo to GitHub.
2. In Railway, create a new project from the GitHub repo.
3. Railway will build the app from the `Dockerfile`.

### 2. Set Railway environment variables

Add these variables in Railway:

```bash
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_SECRET=generate-a-long-random-secret
NEXTAUTH_URL=https://your-app.up.railway.app
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4.1-mini
```

### 3. Configure Google OAuth

In Google Cloud:

1. Open your OAuth client.
2. Add the Railway callback URL:

```text
https://your-app.up.railway.app/api/auth/callback/google
```

3. Add your Railway app domain to the authorized origins:

```text
https://your-app.up.railway.app
```

4. If the OAuth consent screen is still in testing mode, add your own Gmail and your friend’s Gmail as test users.

### 4. Redeploy and test

After setting the Railway variables and Google callback:

1. Trigger a Railway redeploy.
2. Open the deployed URL.
3. Connect Gmail and run a scan.

### Notes

- `NEXTAUTH_URL` should be the final Railway HTTPS URL, not localhost.
- The current app keeps results in memory only. A restart or redeploy clears prior scan results.
- The Railway Docker image now starts the Next.js app and the Docling FastAPI parser together in one service.
- In Railway, you do not need a separate `PDF_PARSER_URL` unless you intentionally want to override the bundled Docling process.
- PDF parsing is still optional for local development. If `PDF_PARSER_URL` is not set locally, only HTML/text receipts are parsed unless you manually run the bundled sidecar.

## Commands

```bash
npm run dev
npm run lint
npm run test
npm run build
```
