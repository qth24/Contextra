import os
from io import BytesIO
from textwrap import dedent

import edge_tts
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.responses import StreamingResponse
from gtts import gTTS

from .schemas import GenerateRequest, GenerateResponse, TTSRequest

app = FastAPI(title="Contextra AI Service")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip()
EDGE_TTS_VOICES = {
    "vi": "vi-VN-HoaiMyNeural",
    "en": "en-US-JennyNeural",
}


def build_prompt(payload: GenerateRequest) -> str:
    return dedent(
        f"""
        You are an expert long-form writing assistant.

        Project: {payload.project_name}
        Project summary: {payload.project_summary}
        Branch: {payload.branch_name}
        Audience: {payload.audience}
        Tone: {payload.tone}
        Shared notes: {payload.shared_notes}
        World rules:
        - {"\n- ".join(payload.world_rules) if payload.world_rules else "No world rules yet."}

        Character digest:
        {payload.character_digest}

        Recent continuity:
        {"\n".join(payload.recent_chapters) if payload.recent_chapters else "No previous chapters."}

        Requested chapter title: {payload.chapter_title}
        Instructions:
        {payload.instructions}

        Return a concise JSON object with:
        - title
        - summary
        - content
        - tokens
        - cost_usd
        - model
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
    return GenerateResponse.model_validate_json(raw_text)

def serialize_response(result: GenerateResponse) -> dict:
    return {
        "title": result.title,
        "summary": result.summary,
        "content": result.content,
        "tokens": result.tokens,
        "costUsd": result.cost_usd,
        "model": result.model,
    }


async def build_tts_audio(text: str, language: str) -> BytesIO:
    normalized_language = "vi" if language.lower().startswith("vi") else "en"
    audio_stream = BytesIO()

    try:
        voice = EDGE_TTS_VOICES[normalized_language]
        communicate = edge_tts.Communicate(text=text, voice=voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_stream.write(chunk["data"])
        audio_stream.seek(0)
        if audio_stream.getbuffer().nbytes > 0:
            return audio_stream
    except Exception:
        audio_stream = BytesIO()

    gTTS(text=text, lang=normalized_language, slow=False).write_to_fp(audio_stream)
    audio_stream.seek(0)
    return audio_stream


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


@app.post("/tts")
async def text_to_speech(payload: TTSRequest):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text is required for TTS")

    try:
        audio_stream = await build_tts_audio(payload.text.strip(), payload.language)
        return StreamingResponse(audio_stream, media_type="audio/mpeg")
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"TTS request failed: {error}") from error
