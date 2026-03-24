# Contextra

Contextra is a microservice-based writing workspace for long-form and collaborative AI-assisted content creation. The stack follows the requested architecture:

- `apps/web`: React + Tailwind editor UI with register/login, expandable left sidebar, center editor, and right toolbar.
- `services/api-gateway`: Express gateway for frontend access control and request forwarding.
- `services/content-service`: Node.js business service for auth, projects, collaborators, memory, branches, versions, and usage tracking.
- `services/ai-service`: FastAPI service for Gemini-based context-aware generation.
- `docker-compose.yml`: Local orchestration for frontend, gateway, backend, AI service, PostgreSQL, and MongoDB.

## Architecture Notes

- PostgreSQL is intended for relational data such as users, plans, workspaces, and usage logs.
- MongoDB is intended for long-form content, chapters, branches, and memory snapshots.
- The current code keeps repository layers in-memory so the auth and project flows can run immediately while remaining easy to replace with PostgreSQL and MongoDB implementations.

## Main Flows

1. The frontend calls the API Gateway at `/api`.
2. The user registers or logs in, then the frontend stores the session token.
3. The API Gateway forwards the auth header and request to the content service.
4. The content service authorizes access, composes project memory, characters, branch context, and recent chapters.
5. The content service calls the AI service for chapter generation.
6. The AI service requires `GEMINI_API_KEY` and sends the prompt to Gemini.
7. Every write action produces a version snapshot and logs usage metadata.

## Folder Structure

```text
contextra/
├─ apps/web
├─ services/api-gateway
├─ services/content-service
├─ services/ai-service
├─ docker-compose.yml
└─ README.md
```

## Run With Docker

1. Copy `.env.example` to `.env`.
2. Add a valid `GEMINI_API_KEY`.
3. Run:

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- API Gateway: `http://localhost:4000`
- Content Service: `http://localhost:4100`
- AI Service: `http://localhost:8000`

## Run Services Manually

### Frontend

```bash
cd apps/web
npm install
npm run dev
```

### API Gateway

```bash
cd services/api-gateway
npm install
npm run dev
```

### Content Service

```bash
cd services/content-service
npm install
npm run dev
```

### AI Service

```bash
cd services/ai-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Current Feature Coverage

- Register and login
- Create personal or team writing projects
- Open project and writer/account panels from the expandable left sidebar
- Keep shared context memory
- Manage characters, collaborators, and shared notes
- Generate context-aware chapters with Gemini only
- Create story branches and merge them back into main
- Restore previous versions from snapshots
- Export project content as text
- Track AI usage summaries

## Extension Points

- Replace the in-memory repository with PostgreSQL and MongoDB implementations
- Move session and user persistence into PostgreSQL
- Persist embeddings and semantic retrieval in the memory engine
- Add richer export targets like PDF and DOCX
