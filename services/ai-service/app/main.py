import os
from textwrap import dedent

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from .schemas import GenerateRequest, GenerateResponse, ModelChapterResponse

app = FastAPI(title="Contextra AI Service")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip()
INPUT_COST_PER_1K_TOKENS = float(os.getenv("GEMINI_INPUT_COST_PER_1K_TOKENS", "0") or "0")
OUTPUT_COST_PER_1K_TOKENS = float(os.getenv("GEMINI_OUTPUT_COST_PER_1K_TOKENS", "0") or "0")


def build_prompt(payload: GenerateRequest) -> str:
    world_rules = (
        "\n- ".join(payload.world_rules)
        if payload.world_rules
        else "No world rules yet."
    )
    recent_chapters = (
        "\n".join(payload.recent_chapters)
        if payload.recent_chapters
        else "No previous chapters."
    )
    branch_highlights = (
        "\n- ".join(payload.branch_highlights)
        if payload.branch_highlights
        else "No branch highlights yet."
    )
    return dedent(
        f"""
        You are an expert long-form writing assistant.

        Project: {payload.project_name}
        Project summary: {payload.project_summary}
        Branch: {payload.branch_name}
        Branch description: {payload.branch_description}
        Branch highlights:
        - {branch_highlights}
        Audience: {payload.audience}
        Tone: {payload.tone}
        Shared notes: {payload.shared_notes}
        World rules:
        - {world_rules}

        Character digest:
        {payload.character_digest}

        Recent continuity:
        {recent_chapters}

        Requested chapter title: {payload.chapter_title}
        Instructions:
        {payload.instructions}

        Return only valid JSON with:
        - title
        - summary
        - content

        Requirements:
        - Keep continuity strictly aligned with the supplied branch.
        - Do not invent branch history outside the provided continuity.
        - content must be clean HTML using paragraphs and simple inline tags when needed.
        """
    ).strip()


async def call_gemini(payload: GenerateRequest) -> GenerateResponse:
    prompt = build_prompt(payload)
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    body = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt,
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.8,
            "responseMimeType": "application/json",
        },
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(url, json=body)
        response.raise_for_status()
        data = response.json()

    parts = data["candidates"][0]["content"]["parts"]
    raw_text = "".join(part.get("text", "") for part in parts).strip()
    chapter = ModelChapterResponse.model_validate_json(raw_text)
    usage = data.get("usageMetadata", {})
    prompt_tokens = int(usage.get("promptTokenCount", 0) or 0)
    candidate_tokens = int(usage.get("candidatesTokenCount", 0) or 0)
    total_tokens = int(usage.get("totalTokenCount", prompt_tokens + candidate_tokens) or 0)
    cost_usd = ((prompt_tokens / 1000) * INPUT_COST_PER_1K_TOKENS) + ((candidate_tokens / 1000) * OUTPUT_COST_PER_1K_TOKENS)

    return GenerateResponse(
        title=chapter.title,
        summary=chapter.summary,
        content=chapter.content,
        tokens=total_tokens,
        cost_usd=round(cost_usd, 6),
        model=str(data.get("modelVersion") or GEMINI_MODEL),
    )

def serialize_response(result: GenerateResponse) -> dict:
    return {
        "title": result.title,
        "summary": result.summary,
        "content": result.content,
        "tokens": result.tokens,
        "costUsd": result.cost_usd,
        "model": result.model,
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ai-service",
        "gemini_enabled": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL,
    }


@app.post("/generate")
async def generate(payload: GenerateRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")

    try:
        result = await call_gemini(payload)
        return JSONResponse(content=serialize_response(result))
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Gemini request failed: {error}") from error
