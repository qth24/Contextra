import { GenerateChapterInput, GeneratedChapterPayload } from "../types/models";
import { PromptContext } from "./contextService";

interface GenerateRequest {
  input: GenerateChapterInput;
  context: PromptContext;
}

export class AIClient {
  constructor(private readonly baseUrl: string) {}

  async generateChapter(request: GenerateRequest): Promise<GeneratedChapterPayload> {
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_name: request.context.projectName,
        project_summary: request.context.projectSummary,
        chapter_title: request.input.title,
        instructions: request.input.instructions,
        branch_name: request.context.branchName,
        tone: request.context.tone,
        audience: request.context.audience,
        shared_notes: request.context.sharedNotes,
        world_rules: request.context.worldRules,
        character_digest: request.context.characterDigest,
        recent_chapters: request.context.recentChapters,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `AI service returned ${response.status}`);
    }

    const data = (await response.json()) as GeneratedChapterPayload;
    return {
      title: data.title,
      summary: data.summary,
      content: data.content,
      tokens: data.tokens,
      costUsd: data.costUsd,
      model: data.model,
    };
  }

  async synthesizeSpeech(text: string, language: "vi" | "en"): Promise<Buffer> {
    const response = await fetch(`${this.baseUrl}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        language,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `AI service returned ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
