import { ProjectDocument } from "../types/models";

export interface PromptContext {
  projectName: string;
  projectSummary: string;
  branchName: string;
  tone: string;
  audience: string;
  sharedNotes: string;
  worldRules: string[];
  characterDigest: string;
  recentChapters: string[];
}

export class ContextService {
  compose(project: ProjectDocument, branchId: string): PromptContext {
    const branch = project.branches.find((item) => item.id === branchId) ?? project.branches[0];
    const chapters = project.chapters
      .filter((chapter) => chapter.branchId === branchId || chapter.branchId === "main")
      .slice(-3)
      .map((chapter) => `${chapter.title}: ${chapter.summary}`);

    const characterDigest = project.characters.length
      ? project.characters
          .map(
            (character) =>
              `${character.name} (${character.role}) | Goals: ${character.goals} | Traits: ${character.traits.join(", ")} | Memory: ${character.memory}`,
          )
          .join("\n")
      : "No characters defined yet.";

    return {
      projectName: project.metadata.name,
      projectSummary: project.metadata.summary,
      branchName: branch?.name ?? "Main Timeline",
      tone: project.contextMemory.tone,
      audience: project.contextMemory.audience,
      sharedNotes: project.contextMemory.sharedNotes,
      worldRules: project.contextMemory.worldRules,
      characterDigest,
      recentChapters: chapters,
    };
  }

  exportProject(project: ProjectDocument) {
    const chapterBlock = project.chapters
      .map((chapter) => `${chapter.title}\n\n${chapter.content}`)
      .join("\n\n---\n\n");

    return [
      project.metadata.name,
      `Genre: ${project.metadata.genre}`,
      `Mode: ${project.metadata.mode}`,
      `Summary: ${project.metadata.summary}`,
      "",
      "Context Memory",
      `Tone: ${project.contextMemory.tone}`,
      `Audience: ${project.contextMemory.audience}`,
      `Shared notes: ${project.contextMemory.sharedNotes}`,
      `World rules: ${project.contextMemory.worldRules.join(" | ")}`,
      "",
      "Characters",
      ...project.characters.map(
        (character) =>
          `- ${character.name}: ${character.role}. Goals: ${character.goals}. Memory: ${character.memory}`,
      ),
      "",
      "Chapters",
      chapterBlock || "No chapters yet.",
    ].join("\n");
  }
}

