import { ChapterAIContextSnapshot, ProjectDocument } from "../types/models";

export interface PromptContext {
  projectName: string;
  projectSummary: string;
  branchName: string;
  branchDescription: string;
  branchHighlights: string[];
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
    const chapters = this.buildContinuity(project, branch?.id ?? branchId)
      .slice(-5)
      .map((chapter) => `${chapter.title}: ${this.getChapterMemory(chapter)}`);

    const characterDigest = project.characters.length
      ? project.characters
          .map(
            (character) =>
              `${character.name} (${character.role}) | Memory: ${character.memory}`,
          )
          .join("\n")
      : "No characters defined yet.";

    return {
      projectName: project.metadata.name,
      projectSummary: project.metadata.summary,
      branchName: branch?.name ?? "Main Timeline",
      branchDescription: branch?.description ?? "",
      branchHighlights: branch?.highlights ?? [],
      tone: project.contextMemory.tone,
      audience: project.contextMemory.audience,
      sharedNotes: project.contextMemory.sharedNotes,
      worldRules: project.contextMemory.worldRules,
      characterDigest,
      recentChapters: chapters,
    };
  }

  private buildContinuity(project: ProjectDocument, branchId: string, stopAtChapterId?: string, seenBranchIds = new Set<string>()) {
    if (seenBranchIds.has(branchId)) {
      return [];
    }

    seenBranchIds.add(branchId);
    const orderedBranchChapters = [...project.chapters]
      .filter((chapter) => chapter.branchId === branchId)
      .sort((left, right) => left.index - right.index || left.createdAt.localeCompare(right.createdAt));

    const branch = project.branches.find((item) => item.id === branchId);
    let lineage: ProjectDocument["chapters"] = [];

    if (branchId !== "main" && branch?.basedOnChapterId && branch.basedOnChapterId !== "root") {
      const anchorChapter = project.chapters.find((chapter) => chapter.id === branch.basedOnChapterId);
      if (anchorChapter) {
        lineage = this.buildContinuity(project, anchorChapter.branchId, anchorChapter.id, seenBranchIds);
      }
    }

    const currentBranch = stopAtChapterId
      ? orderedBranchChapters.slice(0, Math.max(orderedBranchChapters.findIndex((chapter) => chapter.id === stopAtChapterId) + 1, 0))
      : orderedBranchChapters;

    return [...lineage, ...currentBranch];
  }

  private getChapterMemory(chapter: ProjectDocument["chapters"][number]) {
    const summary = chapter.summary?.trim();
    if (summary) {
      return summary;
    }

    const excerpt = chapter.content
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);

    return excerpt || "No summary yet.";
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
        (character) => `- ${character.name}: ${character.role}. Memory: ${character.memory}`,
      ),
      "",
      "Chapters",
      chapterBlock || "No chapters yet.",
    ].join("\n");
  }

  snapshotForGeneratedChapter(
    context: PromptContext,
    input: { instructions: string; actor: string },
    model?: string,
  ): ChapterAIContextSnapshot {
    return {
      branchName: context.branchName,
      projectSummary: context.projectSummary,
      tone: context.tone,
      audience: context.audience,
      sharedNotes: context.sharedNotes,
      worldRules: [...context.worldRules],
      characterDigest: context.characterDigest,
      recentChapters: [...context.recentChapters],
      instructions: input.instructions,
      actor: input.actor,
      model,
      generatedAt: new Date().toISOString(),
    };
  }
}
