from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    project_name: str
    project_summary: str
    chapter_title: str
    instructions: str
    branch_name: str
    tone: str
    audience: str
    shared_notes: str
    world_rules: list[str] = Field(default_factory=list)
    character_digest: str
    recent_chapters: list[str] = Field(default_factory=list)


class GenerateResponse(BaseModel):
    title: str
    summary: str
    content: str
    tokens: int
    cost_usd: float
    model: str


class TTSRequest(BaseModel):
    text: str
    language: str = "vi"
