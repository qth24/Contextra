import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  api,
  authStorage,
  type AuthUser,
  type DirectMessage,
  type FriendRequest,
  type HomeOverview,
  type ProjectDocument,
  type ProjectPresence,
  type ProjectSummary,
  type PublicProjectSummary,
  type ProjectChatMessage,
  type SocialOverview,
  type UserDirectoryItem,
  type UserSettings,
} from "./lib/api";
import aiIcon from "./assets/tools/ai.png";
import characterIcon from "./assets/tools/character.png";
import chatIcon from "./assets/tools/chat.png";
import contextIcon from "./assets/tools/context.png";
import historyIcon from "./assets/tools/history.png";
import logoIcon from "./assets/logo.png";

type AuthMode = "login" | "register";
type MainView = "home" | "editor";
type OverlayPanel = "projects" | "people" | "friends" | "workspace" | "settings" | null;
type ToolPanel = "generate" | "context" | "character" | "chat" | "history";
type SettingsSection = "appearance" | "language" | "security" | "account";
type UiLanguage = UserSettings["language"];

const sidebarItems: Array<{ id: MainView | "projects" | "people" | "friends" | "workspace" | "settings"; label: string }> = [
  { id: "home", label: "Home" },
  { id: "projects", label: "Projects" },
  { id: "people", label: "People" },
  { id: "friends", label: "Friends" },
  { id: "workspace", label: "Workspace" },
  { id: "settings", label: "Settings" },
];

const toolItems: Array<{ id: ToolPanel; label: string; icon: string }> = [
  { id: "generate", label: "Generate", icon: aiIcon },
  { id: "context", label: "Context", icon: contextIcon },
  { id: "character", label: "Character", icon: characterIcon },
  { id: "chat", label: "Chat", icon: chatIcon },
  { id: "history", label: "History", icon: historyIcon },
];

const themeOptions = [
  { id: "notion", label: "Notion", shell: "#f7f7f5", sidebar: "#fbfbfa", page: "#ffffff", accent: "#2563eb", soft: "#e7eefc" },
  { id: "mist", label: "Mist", shell: "#eef5fb", sidebar: "#f8fcff", page: "#ffffff", accent: "#0284c7", soft: "#dbeafe" },
  { id: "forest", label: "Forest", shell: "#eff8f0", sidebar: "#f9fcf9", page: "#ffffff", accent: "#0f766e", soft: "#ccfbf1" },
  { id: "cream", label: "Cream", shell: "#faf5ee", sidebar: "#fffdf9", page: "#fffdfa", accent: "#c2410c", soft: "#fed7aa" },
  { id: "graphite", label: "Graphite", shell: "#eef2f6", sidebar: "#f8fafc", page: "#ffffff", accent: "#475569", soft: "#dbe4ee" },
  { id: "rose", label: "Rose", shell: "#fff1f2", sidebar: "#fff8f8", page: "#ffffff", accent: "#e11d48", soft: "#fecdd3" },
] as const;

const fontOptions = [
  { id: "notion", label: "Notion UI", className: "app-font-notion" },
  { id: "manrope", label: "Manrope", className: "app-font-manrope" },
  { id: "literata", label: "Literata", className: "app-font-literata" },
  { id: "grotesk", label: "Space Grotesk", className: "app-font-grotesk" },
  { id: "georgia", label: "Georgia", className: "app-font-georgia" },
  { id: "verdana", label: "Verdana", className: "app-font-verdana" },
  { id: "trebuchet", label: "Trebuchet MS", className: "app-font-trebuchet" },
  { id: "courier", label: "Courier New", className: "app-font-courier" },
] as const;

const timeZones = ["Asia/Bangkok", "Asia/Ho_Chi_Minh", "UTC", "America/New_York", "Europe/London"];
const pressableClass = "transition duration-200 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.985]";
const presetTextColors = ["#111827", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777"];

function tr(language: UiLanguage, en: string, vi: string) {
  return language === "vi-VN" ? vi : en;
}

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<UserSettings>({
    language: "en-US",
    timeZone: "Asia/Bangkok",
    securityMode: "standard",
  });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [homeOverview, setHomeOverview] = useState<HomeOverview>({ recentProjects: [], publicProjects: [] });
  const [directoryUsers, setDirectoryUsers] = useState<UserDirectoryItem[]>([]);
  const [friends, setFriends] = useState<AuthUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState<string>();
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [projectChatMessages, setProjectChatMessages] = useState<ProjectChatMessage[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [project, setProject] = useState<ProjectDocument | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string>();
  const [activeBranchId, setActiveBranchId] = useState("main");
  const [mainView, setMainView] = useState<MainView>("home");
  const [overlayPanel, setOverlayPanel] = useState<OverlayPanel>(null);
  const [toolPanel, setToolPanel] = useState<ToolPanel>("generate");
  const [toolDrawerOpen, setToolDrawerOpen] = useState(false);
  const [editorTitle, setEditorTitle] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [message, setMessage] = useState("Ready");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [generateCooldownUntil, setGenerateCooldownUntil] = useState(0);
  const [themeId, setThemeId] = useState<(typeof themeOptions)[number]["id"]>("notion");
  const [fontId, setFontId] = useState<(typeof fontOptions)[number]["id"]>("notion");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [showCreateProjectForm, setShowCreateProjectForm] = useState(false);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const lastLocalEditAtRef = useRef(0);
  const latestSyncPayloadRef = useRef("");
  const lastSelectedChapterRef = useRef<string | undefined>(undefined);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);

  const selectedTheme = themeOptions.find((item) => item.id === themeId) ?? themeOptions[0];
  const selectedFont = fontOptions.find((item) => item.id === fontId) ?? fontOptions[0];
  const visibleChapters =
    project?.chapters.filter((chapter) => chapter.branchId === activeBranchId) ?? [];
  const generateCooldownSeconds = Math.max(0, Math.ceil((generateCooldownUntil - Date.now()) / 1000));
  const toolbarVisible = Boolean(project && mainView === "editor");

  function applySocialOverview(overview: SocialOverview) {
    setDirectoryUsers(overview.users);
    setFriends(overview.friends);
    setIncomingRequests(overview.incomingRequests);
    setOutgoingRequests(overview.outgoingRequests);
  }

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("contextra_theme");
    const storedFont = window.localStorage.getItem("contextra_font");
    if (storedTheme && themeOptions.some((item) => item.id === storedTheme)) {
      setThemeId(storedTheme as (typeof themeOptions)[number]["id"]);
    }
    if (storedFont && fontOptions.some((item) => item.id === storedFont)) {
      setFontId(storedFont as (typeof fontOptions)[number]["id"]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("contextra_theme", themeId);
  }, [themeId]);

  useEffect(() => {
    window.localStorage.setItem("contextra_font", fontId);
  }, [fontId]);

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  useEffect(() => {
    document.title = settings.language === "vi-VN" ? "Contextra - Khong gian viet" : "Contextra Workspace";
  }, [settings.language]);

  useEffect(() => {
    const handleDirectoryRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<SocialOverview>;
      if (!customEvent.detail) {
        return;
      }
      applySocialOverview(customEvent.detail);
    };

    window.addEventListener("contextra-directory-refresh", handleDirectoryRefresh as EventListener);
    return () => window.removeEventListener("contextra-directory-refresh", handleDirectoryRefresh as EventListener);
  }, []);

  useEffect(() => {
    if (!generateCooldownUntil) {
      return;
    }

    const timer = window.setInterval(() => {
      if (Date.now() >= generateCooldownUntil) {
        setGenerateCooldownUntil(0);
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [generateCooldownUntil]);

  async function runAction(actionKey: string, action: () => Promise<void>, successMessage?: string) {
    try {
      setLoadingAction(actionKey);
      await action();
      if (successMessage) {
        setMessage(successMessage);
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Unexpected error";
      setMessage(nextMessage);
      const retry = nextMessage.match(/Retry in (\d+)s/i);
      if (actionKey === "generate" && retry) {
        setGenerateCooldownUntil(Date.now() + Number(retry[1]) * 1000);
      }
    } finally {
      setLoadingAction(null);
    }
  }

  const loading = (key: string) => loadingAction === key;

  async function refreshWorkspace(preferredProjectId?: string) {
    const [projectsResult, homeResult, socialResult] = await Promise.all([
      api.listProjects(),
      api.getHomeOverview(),
      api.getSocialOverview(),
    ]);
    setProjects(projectsResult);
    setHomeOverview(homeResult);
    applySocialOverview(socialResult);
    if (preferredProjectId) {
      setSelectedProjectId(preferredProjectId);
    }
  }

  async function loadProject(projectId: string, nextView: MainView = "editor") {
    const nextProject = await api.getProject(projectId);
    setProject(nextProject);
    setProjectChatMessages(nextProject.chatMessages ?? []);
    setSelectedProjectId(projectId);
    setMainView(nextView);
    const branchId = nextProject.branches.some((branch) => branch.id === activeBranchId) ? activeBranchId : "main";
    setActiveBranchId(branchId);
    const nextChapter = nextProject.chapters.filter((chapter) => chapter.branchId === branchId).at(-1);
    setSelectedChapterId(nextChapter?.id);
    setEditorTitle(nextChapter?.title || "");
    setEditorContent(nextChapter?.content || "");
    latestSyncPayloadRef.current = JSON.stringify({
      id: nextChapter?.id || "",
      title: nextChapter?.title || "",
      content: nextChapter?.content || "",
    });
  }

  function resetDraft(branchId = activeBranchId) {
    setSelectedChapterId(undefined);
    setEditorTitle("");
    setEditorContent("");
    latestSyncPayloadRef.current = JSON.stringify({
      id: "",
      title: "",
      content: "",
    });
    lastSelectedChapterRef.current = undefined;
    setActiveBranchId(branchId);
  }

  function syncEditorContentFromDom() {
    const surface = editorSurfaceRef.current;
    if (!surface) {
      return;
    }

    lastLocalEditAtRef.current = Date.now();
    setEditorContent(surface.innerHTML);
  }

  function focusEditor() {
    editorSurfaceRef.current?.focus();
  }

  function runEditorCommand(command: string, value?: string) {
    focusEditor();
    document.execCommand(command, false, value);
    syncEditorContentFromDom();
  }

  function insertEditorHtml(html: string) {
    focusEditor();
    document.execCommand("insertHTML", false, html);
    syncEditorContentFromDom();
  }

  function applyFontSize(sizePx: number) {
    focusEditor();
    document.execCommand("fontSize", false, "7");
    const surface = editorSurfaceRef.current;
    if (!surface) {
      return;
    }

    surface.querySelectorAll('font[size="7"]').forEach((node) => {
      const span = document.createElement("span");
      span.style.fontSize = `${sizePx}px`;
      span.innerHTML = node.innerHTML;
      node.replaceWith(span);
    });
    syncEditorContentFromDom();
  }

  function toggleBulletList() {
    focusEditor();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("insertUnorderedList", false);
    syncEditorContentFromDom();
  }

  function insertImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }

      const imageData = await readFileAsDataUrl(file);
      insertEditorHtml(`
        <div class="editor-image-wrap" data-crop-frame="true" contenteditable="false">
          <img src="${imageData}" alt="${escapeHtml(file.name || "Image")}" data-pos-x="50" data-pos-y="50" style="object-position: 50% 50%;" />
        </div>
        <p></p>
      `);
    };
    input.click();
  }

  function getSelectedImage() {
    if (selectedImageRef.current) {
      return selectedImageRef.current;
    }
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    const element = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement;
    return element?.closest(".editor-image-wrap")?.querySelector("img") ?? editorSurfaceRef.current?.querySelector(".editor-image-wrap img:last-of-type") ?? null;
  }

  function focusCropMode() {
    const image = getSelectedImage();
    if (!image) {
      setMessage("Select an image first");
      return;
    }

    const wrapper = image.closest(".editor-image-wrap");
    wrapper?.classList.add("is-cropping");
    setMessage("Drag the image inside the frame to choose the crop");
    window.setTimeout(() => wrapper?.classList.remove("is-cropping"), 1800);
  }

  async function exportCurrentDraft() {
    const surface = editorSurfaceRef.current;
    if (!surface) {
      return;
    }

    setMessage("Exporting PDF...");

    const exportRoot = document.createElement("div");
    exportRoot.className = `${selectedFont.className} fixed left-[-20000px] top-0 w-[960px] bg-white px-10 py-10 text-slate-900`;
    exportRoot.innerHTML = `<div class="editor-surface">${surface.innerHTML}</div>`;
    document.body.appendChild(exportRoot);

    try {
      const canvas = await html2canvas(exportRoot, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });

      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;
      const imageHeight = (canvas.height * printableWidth) / canvas.width;

      let heightLeft = imageHeight;
      let position = margin;

      pdf.addImage(imageData, "PNG", margin, position, printableWidth, imageHeight);
      heightLeft -= printableHeight;

      while (heightLeft > 0) {
        position = heightLeft - imageHeight + margin;
        pdf.addPage();
        pdf.addImage(imageData, "PNG", margin, position, printableWidth, imageHeight);
        heightLeft -= printableHeight;
      }

      pdf.save(`${sanitizeFileName(editorTitle || project?.metadata.name || "chapter")}.pdf`);
      setMessage("PDF exported");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export PDF");
    } finally {
      exportRoot.remove();
    }
  }

  function getSelectedTable() {
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    const element = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement;
    return element?.closest("table") ?? editorSurfaceRef.current?.querySelector("table:last-of-type") ?? null;
  }

  function insertTable() {
    insertEditorHtml(`
      <div class="editor-table-wrap">
        <table>
          <tbody>
            <tr><th>Header 1</th><th>Header 2</th></tr>
            <tr><td>Cell 1</td><td>Cell 2</td></tr>
          </tbody>
        </table>
      </div>
      <p></p>
    `);
  }

  function placeCaretInBlankArea(event: ReactMouseEvent<HTMLDivElement>) {
    const surface = editorSurfaceRef.current;
    if (!surface || event.target !== surface) {
      return;
    }

    event.preventDefault();
    surface.focus();

    const surfaceRect = surface.getBoundingClientRect();
    const clickY = event.clientY - surfaceRect.top;
    const lineHeight = 32;
    let lastBottom = 0;
    const lastElement = surface.lastElementChild as HTMLElement | null;
    if (lastElement) {
      lastBottom = lastElement.getBoundingClientRect().bottom - surfaceRect.top;
    }

    const missingLines = Math.max(1, Math.ceil((clickY - lastBottom) / lineHeight));
    for (let index = 0; index < missingLines; index += 1) {
      const paragraph = document.createElement("p");
      paragraph.innerHTML = "<br>";
      surface.appendChild(paragraph);
    }

    const targetParagraph = surface.lastElementChild;
    if (targetParagraph) {
      const range = document.createRange();
      range.setStart(targetParagraph, 0);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      syncEditorContentFromDom();
    }
  }

  function addTableRow() {
    const table = getSelectedTable();
    if (!table) {
      setMessage("Select a table first");
      return;
    }

    const templateRow = table.rows[table.rows.length - 1] ?? table.rows[0];
    if (!templateRow) {
      return;
    }

    const row = table.insertRow();
    Array.from(templateRow.cells).forEach(() => {
      const cell = row.insertCell();
      cell.innerHTML = "&nbsp;";
    });
    syncEditorContentFromDom();
    setMessage("Table row added");
  }

  function addTableColumn() {
    const table = getSelectedTable();
    if (!table) {
      setMessage("Select a table first");
      return;
    }

    Array.from(table.rows).forEach((row, rowIndex) => {
      const headerRow = row.querySelector("th");
      const cell = row.insertCell();
      if (headerRow || rowIndex === 0) {
        const th = document.createElement("th");
        th.innerHTML = `Header ${row.cells.length}`;
        row.deleteCell(row.cells.length - 1);
        row.appendChild(th);
        return;
      }

      cell.innerHTML = "&nbsp;";
    });
    syncEditorContentFromDom();
    setMessage("Table column added");
  }

  useEffect(() => {
    const surface = editorSurfaceRef.current;
    if (!surface) {
      return;
    }

    let activeImage: HTMLImageElement | null = null;
    let activeWrapper: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let startPosX = 50;
    let startPosY = 50;

    const handleMove = (event: MouseEvent) => {
      if (!activeImage || !activeWrapper) {
        return;
      }

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const width = Math.max(activeWrapper.clientWidth, 120);
      const height = Math.max(activeWrapper.clientHeight, 120);
      const nextPosX = clamp(startPosX - (dx / width) * 100, 0, 100);
      const nextPosY = clamp(startPosY - (dy / height) * 100, 0, 100);
      activeImage.dataset.posX = String(nextPosX);
      activeImage.dataset.posY = String(nextPosY);
      activeImage.style.objectPosition = `${nextPosX}% ${nextPosY}%`;
    };

    const clearActive = () => {
      if (activeWrapper) {
        activeWrapper.classList.remove("is-cropping");
      }
      if (activeImage) {
        syncEditorContentFromDom();
      }
      activeImage = null;
      activeWrapper = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", clearActive);
    };

      const handleDown = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement)) {
          return;
        }

      const wrapper = target.closest(".editor-image-wrap");
      if (!(wrapper instanceof HTMLElement)) {
        return;
      }

      event.preventDefault();
      activeImage = target;
      activeWrapper = wrapper;
      selectedImageRef.current = target;
      startX = event.clientX;
      startY = event.clientY;
      startPosX = Number(target.dataset.posX || "50");
      startPosY = Number(target.dataset.posY || "50");
      wrapper.classList.add("is-cropping");
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", clearActive);
    };

      surface.addEventListener("mousedown", handleDown);
      return () => {
        surface.removeEventListener("mousedown", handleDown);
        clearActive();
      };
  }, [editorSurfaceRef, selectedChapterId]);

  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) {
      return;
    }

    void runAction("bootstrap", async () => {
      const result = await api.me();
      setUser(result.user);
      setSettings(result.settings);
      await refreshWorkspace();
    });
  }, []);

  useEffect(() => {
    if (!project || !selectedChapterId) {
      return;
    }

    const chapter = project.chapters.find((item) => item.id === selectedChapterId);
    if (!chapter) {
      return;
    }

    const incomingPayload = JSON.stringify({
      id: chapter.id,
      title: chapter.title,
      content: chapter.content,
    });
    const chapterChanged = lastSelectedChapterRef.current !== selectedChapterId;
    const isActivelyTyping = Date.now() - lastLocalEditAtRef.current < 1600;

    if (chapterChanged || !isActivelyTyping || incomingPayload === latestSyncPayloadRef.current) {
      setEditorTitle(chapter.title);
      setEditorContent(chapter.content);
      latestSyncPayloadRef.current = incomingPayload;
    }

    lastSelectedChapterRef.current = selectedChapterId;
  }, [project, selectedChapterId]);

  useEffect(() => {
    if (!project) {
      return;
    }

    const nextBranchId = project.branches.some((branch) => branch.id === activeBranchId) ? activeBranchId : "main";
    if (nextBranchId !== activeBranchId) {
      setActiveBranchId(nextBranchId);
      return;
    }

    if (!selectedChapterId) {
      return;
    }

    const selectedChapter = project.chapters.find((chapter) => chapter.id === selectedChapterId);
    if (selectedChapter?.branchId === nextBranchId) {
      return;
    }

    const fallbackChapter = project.chapters.filter((chapter) => chapter.branchId === nextBranchId).at(-1);
    if (fallbackChapter) {
      setSelectedChapterId(fallbackChapter.id);
      setEditorTitle(fallbackChapter.title);
      setEditorContent(fallbackChapter.content);
      latestSyncPayloadRef.current = JSON.stringify({
        id: fallbackChapter.id,
        title: fallbackChapter.title,
        content: fallbackChapter.content,
      });
      return;
    }

    resetDraft(nextBranchId);
  }, [activeBranchId, project, selectedChapterId]);

  useEffect(() => {
    const surface = editorSurfaceRef.current;
    if (!surface) {
      return;
    }

    if (surface.innerHTML !== editorContent) {
      surface.innerHTML = editorContent;
    }
  }, [editorContent, selectedChapterId]);

  useEffect(() => {
    if (!project || project.metadata.mode !== "team" || !selectedChapterId) {
      return;
    }

    const canEdit = project.viewerAccess?.canEdit ?? false;
    if (!canEdit) {
      return;
    }

    const timer = window.setTimeout(async () => {
      const chapter = project.chapters.find((item) => item.id === selectedChapterId);
      if (!chapter) {
        return;
      }

      const nextPayload = JSON.stringify({
        id: chapter.id,
        title: editorTitle,
        content: editorContent,
      });
      if (nextPayload === latestSyncPayloadRef.current) {
        return;
      }

      try {
        const updated = await api.updateChapter(project.metadata.id, selectedChapterId, {
          title: editorTitle,
          content: editorContent,
          summary: stripHtml(editorContent).slice(0, 180),
        });
        latestSyncPayloadRef.current = nextPayload;
        setProject(updated);
      } catch {
        // Save button still gives explicit feedback. Polling sync should stay quiet.
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [editorContent, editorTitle, project, selectedChapterId]);

  useEffect(() => {
    if (!selectedProjectId || !project || project.metadata.mode !== "team") {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const [nextProject, chatResult] = await Promise.all([
          api.getProject(selectedProjectId),
          api.getProjectChat(selectedProjectId),
        ]);
        setProjectChatMessages(chatResult.messages);
        setProject(nextProject);

        const currentChapter = nextProject.chapters.find((item) => item.id === selectedChapterId);
        const isActivelyTyping = Date.now() - lastLocalEditAtRef.current < 1600;
        if (currentChapter && !isActivelyTyping) {
          setEditorTitle(currentChapter.title);
          setEditorContent(currentChapter.content);
          latestSyncPayloadRef.current = JSON.stringify({
            id: currentChapter.id,
            title: currentChapter.title,
            content: currentChapter.content,
          });
        }
      } catch {
        // Keep editor responsive if a polling request fails once.
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [project?.metadata.mode, selectedChapterId, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId || !project || project.metadata.mode !== "team") {
      return;
    }

    let active = true;

    const sendPresence = async () => {
      try {
        const status: ProjectPresence["status"] = Date.now() - lastLocalEditAtRef.current < 2500 ? "editing" : "reading";
        const result = await api.updateProjectPresence(selectedProjectId, {
          status,
          chapterId: selectedChapterId,
        });
        if (!active) {
          return;
        }
        setProject((current) => (current && current.metadata.id === selectedProjectId ? { ...current, activeUsers: result.activeUsers } : current));
      } catch {
        // Presence is best-effort.
      }
    };

    void sendPresence();
    const timer = window.setInterval(() => void sendPresence(), 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [project?.metadata.mode, selectedChapterId, selectedProjectId]);

  useEffect(() => {
    if (!selectedFriendId) {
      setDirectMessages([]);
      return;
    }

    let active = true;
    const syncMessages = async () => {
      try {
        const result = await api.getDirectMessages(selectedFriendId);
        if (active) {
          setDirectMessages(result.messages);
        }
      } catch {
        if (active) {
          setDirectMessages([]);
        }
      }
    };

    void syncMessages();
    const timer = window.setInterval(() => void syncMessages(), 1200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedFriendId]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] p-6 app-font-notion">
        <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_30px_100px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Contextra</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900">Context-aware workspace</h1>
          <p className="mt-3 text-sm leading-7 text-slate-500">
            Login or register to open your writing projects, publish public projects, and continue your drafts.
          </p>
          <form
            className="mt-8 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await runAction(
                "auth",
                async () => {
                  const payload =
                    authMode === "register"
                      ? await api.register({
                          name: String(form.get("name") || ""),
                          email: String(form.get("email") || ""),
                          password: String(form.get("password") || ""),
                        })
                      : await api.login({
                          email: String(form.get("email") || ""),
                          password: String(form.get("password") || ""),
                        });
                  authStorage.setToken(payload.token);
                  const me = await api.me();
                  setUser(me.user);
                  setSettings(me.settings);
                  await refreshWorkspace();
                },
                authMode === "register" ? "Registered successfully" : "Logged in successfully",
              );
            }}
          >
            {authMode === "register" ? (
              <input name="name" placeholder="Full name" required className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
            ) : null}
            <input name="email" type="email" placeholder="Email" required className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
            <input name="password" type="password" placeholder="Password" required className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
            <button type="submit" disabled={loading("auth")} className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-70">
              {loading("auth") ? "Please wait..." : authMode === "register" ? "Register" : "Login"}
            </button>
          </form>
          <button type="button" onClick={() => setAuthMode((current) => (current === "login" ? "register" : "login"))} className="mt-4 text-sm text-blue-700">
            {authMode === "login" ? "Create a new account" : "Already have an account?"}
          </button>
          <p className="mt-4 text-sm text-slate-500">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen overflow-hidden text-slate-900 ${selectedFont.className}`} style={{ backgroundColor: selectedTheme.shell }}>
      <div className="flex h-full">
        <WorkspaceSidebar
          language={settings.language}
          projects={projects}
          friends={friends}
          peopleCount={directoryUsers.length}
          selectedProjectId={selectedProjectId}
          activeMainView={mainView}
          accent={selectedTheme.accent}
          onOpenHome={() => {
            setMainView("home");
            setOverlayPanel(null);
          }}
          onOpenPanel={(panel) => setOverlayPanel(panel)}
          onSelectProject={(projectId) => void loadProject(projectId)}
          onCreateProjectShortcut={() => {
            setOverlayPanel("projects");
            setShowCreateProjectForm(true);
          }}
        />

        <main className="relative min-w-0 flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto px-2 py-2 lg:px-3">
            {mainView === "home" ? (
              <HomeView
                language={settings.language}
                user={user}
                recentProjects={homeOverview.recentProjects}
                publicProjects={homeOverview.publicProjects}
                onOpenProject={(projectId) => void loadProject(projectId)}
                onCreateProject={() => {
                  setOverlayPanel("projects");
                  setShowCreateProjectForm(true);
                }}
              />
            ) : (
              <EditorWorkspace
                language={settings.language}
                project={project}
                selectedChapterId={selectedChapterId}
                visibleChapters={visibleChapters}
                activeBranchId={activeBranchId}
                editorTitle={editorTitle}
                editorContent={editorContent}
                loadingGenerate={loading("generate")}
                loadingSave={loading("save-chapter")}
                canEdit={project?.viewerAccess?.canEdit ?? true}
                activeUsers={project?.activeUsers ?? []}
                editorSurfaceRef={editorSurfaceRef}
                onSelectChapter={setSelectedChapterId}
                onSelectBranch={(branchId) => {
                  setActiveBranchId(branchId);
                  const branchChapter = project?.chapters.filter((chapter) => chapter.branchId === branchId).at(-1);
                  if (branchChapter) {
                    setSelectedChapterId(branchChapter.id);
                    return;
                  }
                  resetDraft(branchId);
                }}
                onCreateChapter={() =>
                  void runAction(
                    "new-chapter",
                    async () => {
                      if (!project) {
                        return;
                      }
                      const updated = await api.createChapter(project.metadata.id, {
                        title: "Untitled chapter",
                        content: "<p></p>",
                        summary: "",
                        branchId: activeBranchId,
                      });
                      const latestChapter = updated.chapters.filter((chapter) => chapter.branchId === activeBranchId).at(-1);
                      latestSyncPayloadRef.current = JSON.stringify({
                        id: latestChapter?.id || "",
                        title: latestChapter?.title || "Untitled chapter",
                        content: latestChapter?.content || "<p></p>",
                      });
                      setProject(updated);
                      setSelectedChapterId(latestChapter?.id);
                      setEditorTitle(latestChapter?.title || "Untitled chapter");
                      setEditorContent(latestChapter?.content || "<p></p>");
                      await refreshWorkspace(project.metadata.id);
                    },
                    "Chapter created",
                  )
                }
                onDeleteChapter={(chapterId) => {
                  if (!window.confirm(tr(settings.language, "Delete this chapter?", "Xoa chapter nay?"))) {
                    return;
                  }
                  void runAction(
                    "delete-chapter-inline",
                    async () => {
                      if (!project) {
                        return;
                      }
                      const updated = await api.deleteChapter(project.metadata.id, chapterId);
                      setProject(updated);
                      await refreshWorkspace(project.metadata.id);
                    },
                    tr(settings.language, "Chapter deleted", "Da xoa chapter"),
                  );
                }}
                onTitleChange={(value) => {
                  lastLocalEditAtRef.current = Date.now();
                  setEditorTitle(value);
                }}
                onBlankAreaMouseDown={placeCaretInBlankArea}
                onContentInput={syncEditorContentFromDom}
                onBold={() => runEditorCommand("bold")}
                onItalic={() => runEditorCommand("italic")}
                onUnderline={() => runEditorCommand("underline")}
                onBullet={toggleBulletList}
                onAlign={(align) =>
                  runEditorCommand(
                    align === "left" ? "justifyLeft" : align === "center" ? "justifyCenter" : "justifyRight",
                  )
                }
                onFontSizeChange={applyFontSize}
                onInsertImage={insertImage}
                onCropImage={focusCropMode}
                onApplyColor={(color) => runEditorCommand("foreColor", color)}
                onInsertTable={insertTable}
                onAddTableColumn={addTableColumn}
                onAddTableRow={addTableRow}
                onExport={exportCurrentDraft}
                onOpenProjectManager={() => setShowProjectManager(true)}
                onSave={() =>
                  void runAction(
                    "save-chapter",
                    async () => {
                      if (!project) return;
                      const basePayload = {
                        title: editorTitle.trim() || "Untitled chapter",
                        content: editorContent,
                        summary: stripHtml(editorContent).slice(0, 180),
                      };
                      const updated = selectedChapterId
                        ? await api.updateChapter(project.metadata.id, selectedChapterId, basePayload)
                        : await api.createChapter(project.metadata.id, {
                            ...basePayload,
                            branchId: activeBranchId,
                          });
                      const latestChapter = selectedChapterId
                        ? updated.chapters.find((chapter) => chapter.id === selectedChapterId)
                        : updated.chapters.at(-1);
                      latestSyncPayloadRef.current = JSON.stringify({
                        id: latestChapter?.id || "",
                        title: latestChapter?.title || basePayload.title,
                        content: latestChapter?.content || basePayload.content,
                      });
                      setSelectedChapterId(latestChapter?.id);
                      setProject(updated);
                      await refreshWorkspace(project.metadata.id);
                    },
                    "Chapter saved",
                  )
                }
              />
            )}
          </div>

          {toolbarVisible ? (
            <FloatingToolDock
              activePanel={toolPanel}
              drawerOpen={toolDrawerOpen}
              accent={selectedTheme.accent}
              onSelect={(panel) => {
                if (toolDrawerOpen && toolPanel === panel) {
                  setToolDrawerOpen(false);
                  return;
                }
                setToolPanel(panel);
                setToolDrawerOpen(true);
              }}
            />
          ) : null}

          {toolbarVisible && toolDrawerOpen ? (
            <ToolDrawer
              project={project}
              user={user}
              activeBranchId={activeBranchId}
              activePanel={toolPanel}
              accent={selectedTheme.accent}
              generateCooldownSeconds={generateCooldownSeconds}
              loading={loading}
              chatMessages={projectChatMessages}
              onClose={() => setToolDrawerOpen(false)}
              onGenerated={(updated) => {
                setProject(updated);
                setProjectChatMessages(updated.chatMessages ?? []);
                const latest = updated.chapters.at(-1);
                setSelectedChapterId(latest?.id);
                setMainView("editor");
                void refreshWorkspace(updated.metadata.id);
              }}
              onChanged={(updated) => {
                setProject(updated);
                setProjectChatMessages(updated.chatMessages ?? []);
                void refreshWorkspace(updated.metadata.id);
              }}
              onChatChanged={setProjectChatMessages}
              runAction={runAction}
            />
          ) : null}

          {showProjectManager && project ? (
            <ProjectManagementOverlay
              project={project}
              friends={friends}
              accent={selectedTheme.accent}
              loading={loading}
              onClose={() => setShowProjectManager(false)}
              onChanged={(updated) => {
                setProject(updated);
                setProjectChatMessages(updated.chatMessages ?? []);
                void refreshWorkspace(updated.metadata.id);
              }}
              runAction={runAction}
            />
          ) : null}

          {overlayPanel === "projects" ? (
            <ProjectsOverlay
              language={settings.language}
              projects={projects}
              project={project}
              selectedProjectId={selectedProjectId}
              accent={selectedTheme.accent}
              loadingCreate={loading("create-project")}
              loadingVisibility={loading("visibility")}
              showCreateProjectForm={showCreateProjectForm}
              canManage={project?.viewerAccess?.canManage ?? true}
              onClose={() => {
                setOverlayPanel(null);
                setShowCreateProjectForm(false);
              }}
              onSelectProject={(projectId) => void loadProject(projectId)}
              onToggleCreateForm={() => setShowCreateProjectForm((current) => !current)}
              onCreateProject={(form) =>
                void runAction(
                  "create-project",
                  async () => {
                    const created = await api.createProject(form);
                    setShowCreateProjectForm(false);
                    await refreshWorkspace(created.metadata.id);
                    await loadProject(created.metadata.id);
                    setOverlayPanel(null);
                  },
                  "Project created",
                )
              }
              onTogglePublic={(isPublic) =>
                void runAction(
                  "visibility",
                  async () => {
                    if (!project) return;
                    const updated = await api.updateProjectVisibility(project.metadata.id, isPublic);
                    setProject(updated);
                    await refreshWorkspace(updated.metadata.id);
                  },
                  isPublic ? "Project is now public" : "Project is now private",
                )
              }
            />
          ) : null}

          {overlayPanel === "people" ? (
            <PeopleOverlay
              language={settings.language}
              accent={selectedTheme.accent}
              users={directoryUsers}
              incomingRequests={incomingRequests}
              outgoingRequests={outgoingRequests}
              onClose={() => setOverlayPanel(null)}
              runAction={runAction}
              onSocialChanged={(overview) => {
                applySocialOverview(overview);
              }}
              onOpenFriend={(friendId) => {
                setSelectedFriendId(friendId);
                setOverlayPanel("friends");
              }}
            />
          ) : null}

          {overlayPanel === "friends" ? (
            <FriendsOverlay
              language={settings.language}
              user={user}
              accent={selectedTheme.accent}
              friends={friends}
              selectedFriendId={selectedFriendId}
              directMessages={directMessages}
              onClose={() => setOverlayPanel(null)}
              onSelectFriend={setSelectedFriendId}
              runAction={runAction}
              onMessagesChanged={setDirectMessages}
            />
          ) : null}

          {overlayPanel === "settings" ? (
            <SettingsOverlay
              language={settings.language}
              user={user}
              settings={settings}
              section={settingsSection}
              setSection={setSettingsSection}
              themeId={themeId}
              setThemeId={setThemeId}
              fontId={fontId}
              setFontId={setFontId}
              onClose={() => setOverlayPanel(null)}
              onLogout={() => {
                authStorage.clear();
                setUser(null);
                setProject(null);
                setProjects([]);
                setHomeOverview({ recentProjects: [], publicProjects: [] });
                setDirectoryUsers([]);
                setFriends([]);
                setIncomingRequests([]);
                setOutgoingRequests([]);
                setSelectedFriendId(undefined);
                setDirectMessages([]);
                setProjectChatMessages([]);
                setSelectedProjectId(undefined);
                setSelectedChapterId(undefined);
                setOverlayPanel(null);
                setShowProjectManager(false);
                setToolDrawerOpen(false);
                setMainView("home");
                setMessage("Logged out");
              }}
              onUpdateAccount={(payload) =>
                runAction(
                  "account",
                  async () => {
                    await api.updateAccount(payload);
                    const me = await api.me();
                    setUser(me.user);
                    setSettings(me.settings);
                  },
                  "Account updated",
                )
              }
              onSaveSettings={(nextSettings) =>
                runAction(
                  "settings",
                  async () => {
                    await api.updateSettings(nextSettings);
                    const me = await api.me();
                    setUser(me.user);
                    setSettings(me.settings);
                  },
                  "Settings updated",
                )
              }
            />
          ) : null}

          {overlayPanel === "workspace" ? (
            <WorkspaceOverlay project={project} accent={selectedTheme.accent} onClose={() => setOverlayPanel(null)} />
          ) : null}
        </main>
      </div>

      <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900/92 px-5 py-2 text-sm text-white shadow-lg">
        {loadingAction ? "Working..." : message}
      </div>
    </div>
  );
}

function WorkspaceSidebar({
  language,
  projects,
  friends,
  peopleCount,
  selectedProjectId,
  activeMainView,
  accent,
  onOpenHome,
  onOpenPanel,
  onSelectProject,
  onCreateProjectShortcut,
}: {
  language: UiLanguage;
  projects: ProjectSummary[];
  friends: AuthUser[];
  peopleCount: number;
  selectedProjectId?: string;
  activeMainView: MainView;
  accent: string;
  onOpenHome: () => void;
  onOpenPanel: (panel: OverlayPanel) => void;
  onSelectProject: (projectId: string) => void;
  onCreateProjectShortcut: () => void;
}) {
  return (
    <aside className="flex h-full w-[16.5rem] shrink-0 flex-col border-r border-black/5 bg-[#fbfbfa] px-3 py-4">
      <div className="mb-4 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
          <img src={logoIcon} alt="Contextra" className="h-8 w-8 object-contain" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{tr(language, "Contextra workspace", "Contextra workspace")}</p>
          <p className="text-xs text-slate-400">{tr(language, "AI writing space", "Khong gian viet voi AI")}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white px-3 py-2.5 text-sm text-slate-400 shadow-sm">{tr(language, "Search", "Tim kiem")}</div>

      <div className="mt-4 space-y-1">
        {sidebarItems.map((item) => {
          const isActive = item.id === "home" ? activeMainView === "home" : false;
          const label =
            item.id === "home" ? tr(language, "Home", "Trang chu")
            : item.id === "projects" ? tr(language, "Projects", "Projects")
            : item.id === "people" ? tr(language, "People", "People")
            : item.id === "friends" ? tr(language, "Friends", "Friends")
            : item.id === "workspace" ? tr(language, "Workspace", "Workspace")
            : tr(language, "Settings", "Cai dat");
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === "home") {
                  onOpenHome();
                  return;
                }
                onOpenPanel(item.id as OverlayPanel);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] font-medium ${pressableClass} ${
                isActive ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white"
              }`}
            >
              <span>{label}</span>
              {item.id === "projects" ? <span className="text-xs text-slate-400">{projects.length}</span> : null}
              {item.id === "people" ? <span className="text-xs text-slate-400">{peopleCount}</span> : null}
              {item.id === "friends" ? <span className="text-xs text-slate-400">{friends.length}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between px-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Projects</p>
        <button type="button" onClick={onCreateProjectShortcut} className={`rounded-full px-2 py-1 text-xs font-medium text-white ${pressableClass}`} style={{ backgroundColor: accent }}>
          {tr(language, "New", "Moi")}
        </button>
      </div>

      <div className="mt-3 space-y-1 overflow-y-auto">
        {projects.slice(0, 8).map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelectProject(project.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${pressableClass} ${
              selectedProjectId === project.id ? "bg-white shadow-sm" : "hover:bg-white"
            }`}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-sm font-semibold text-slate-500"
              style={project.coverImageUrl ? { backgroundImage: `url(${project.coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
            >
              {!project.coverImageUrl ? project.name.slice(0, 1).toUpperCase() : null}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-700">{project.name}</p>
              <p className="truncate text-xs text-slate-400">{project.genre}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-auto h-2" />
    </aside>
  );
}

function HomeView({
  language,
  user,
  recentProjects,
  publicProjects,
  onOpenProject,
  onCreateProject,
}: {
  language: UiLanguage;
  user: AuthUser;
  recentProjects: HomeOverview["recentProjects"];
  publicProjects: PublicProjectSummary[];
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-10 pt-6">
        <p className="text-sm text-slate-400">{tr(language, "Workspace overview", "Tong quan workspace")}</p>
        <h1 className="mt-3 text-[3rem] font-semibold tracking-[-0.05em] text-slate-900">{tr(language, "Good morning", "Chao buoi sang")}, {user.name.split(" ")[0]}</h1>
      </div>

      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-500">{tr(language, "Recently visited", "Gan day")}</p>
          <button type="button" onClick={onCreateProject} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            {tr(language, "Create project", "Tao project")}
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {recentProjects.map((project) => (
            <button key={project.id} type="button" onClick={() => onOpenProject(project.id)} className={`rounded-[26px] border border-slate-200 bg-white p-5 text-left shadow-[0_12px_40px_rgba(15,23,42,0.05)] ${pressableClass}`}>
              <div
                className="mb-8 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-slate-500"
                style={project.coverImageUrl ? { backgroundImage: `url(${project.coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
              >
                {!project.coverImageUrl ? project.name.slice(0, 1).toUpperCase() : null}
              </div>
              <p className="text-xl font-semibold tracking-[-0.03em] text-slate-900">{project.name}</p>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">{project.summary || "No summary yet."}</p>
              <div className="mt-5 flex items-center justify-between text-xs text-slate-400">
                <span>{project.genre}</span>
                <span>{project.isPublic ? "Public" : "Private"}</span>
              </div>
            </button>
          ))}
          {!recentProjects.length ? (
            <button type="button" onClick={onCreateProject} className="rounded-[26px] border border-dashed border-slate-300 bg-white p-5 text-left text-slate-500">
              <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">+</div>
              <p className="text-xl font-semibold text-slate-800">New project</p>
              <p className="mt-3 text-sm leading-6">{tr(language, "Create your first workspace and start writing with context-aware AI.", "Tao workspace dau tien va bat dau viet voi AI hieu context.")}</p>
            </button>
          ) : null}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-500">{tr(language, "Public projects", "Project cong khai")}</p>
          <p className="text-sm text-slate-400">{tr(language, "Projects shared by other members", "Project duoc chia se boi cac thanh vien khac")}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          {publicProjects.map((project) => (
            <button key={project.id} type="button" onClick={() => onOpenProject(project.id)} className={`rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-[0_12px_40px_rgba(15,23,42,0.05)] ${pressableClass}`}>
              <div
                className="mb-6 h-28 rounded-[20px] bg-gradient-to-br from-slate-100 to-white"
                style={project.coverImageUrl ? { backgroundImage: `url(${project.coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
              />
              <p className="text-lg font-semibold tracking-[-0.03em] text-slate-900">{project.name}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{project.summary || "Public writing project"}</p>
              <p className="mt-4 text-xs text-slate-400">
                {project.ownerName} • {project.genre}
              </p>
            </button>
          ))}
          {!publicProjects.length ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
              No public projects yet. Publish one from the Projects panel to share it.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function EditorWorkspace({
  language,
  project,
  selectedChapterId,
  visibleChapters,
  activeBranchId,
  editorTitle,
  editorContent,
  loadingGenerate,
  loadingSave,
  canEdit,
  activeUsers,
  editorSurfaceRef,
  onSelectChapter,
  onSelectBranch,
  onCreateChapter,
  onDeleteChapter,
  onTitleChange,
  onBlankAreaMouseDown,
  onContentInput,
  onBold,
  onItalic,
  onUnderline,
  onBullet,
  onAlign,
  onFontSizeChange,
  onInsertImage,
  onCropImage,
  onApplyColor,
  onInsertTable,
  onAddTableRow,
  onAddTableColumn,
  onExport,
  onOpenProjectManager,
  onSave,
}: {
  language: UiLanguage;
  project: ProjectDocument | null;
  selectedChapterId?: string;
  visibleChapters: ProjectDocument["chapters"];
  activeBranchId: string;
  editorTitle: string;
  editorContent: string;
  loadingGenerate: boolean;
  loadingSave: boolean;
  canEdit: boolean;
  activeUsers: ProjectPresence[];
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>;
  onSelectChapter: (chapterId: string) => void;
  onSelectBranch: (branchId: string) => void;
  onCreateChapter: () => void;
  onDeleteChapter: (chapterId: string) => void;
  onTitleChange: (value: string) => void;
  onBlankAreaMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onContentInput: () => void;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onBullet: () => void;
  onAlign: (align: "left" | "center" | "right") => void;
  onFontSizeChange: (size: number) => void;
  onInsertImage: () => void;
  onCropImage: () => void;
  onApplyColor: (color: string) => void;
  onInsertTable: () => void;
  onAddTableRow: () => void;
  onAddTableColumn: () => void;
  onExport: () => void;
  onOpenProjectManager: () => void;
  onSave: () => void;
}) {
  if (!project) {
    return <div className="flex h-full items-center justify-center text-slate-500">{tr(language, "Select a project to start writing.", "Chon mot project de bat dau viet.")}</div>;
  }

  return (
    <div className="w-full pb-6 pt-2">
      <section className="min-w-0">
        <div className="rounded-[30px] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)] lg:px-5">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] bg-slate-100 text-sm font-semibold text-slate-500"
                style={project.metadata.coverImageUrl ? { backgroundImage: `url(${project.metadata.coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
              >
                {!project.metadata.coverImageUrl ? project.metadata.name.slice(0, 1).toUpperCase() : null}
              </div>
              <div>
                <p className="text-sm text-slate-400">{project.metadata.name}</p>
                <p className="text-sm text-slate-400">
                  {project.metadata.mode === "team" ? tr(language, "Team workspace", "Workspace nhom") : tr(language, "Personal workspace", "Workspace ca nhan")} • {project.metadata.isPublic ? tr(language, "Public project", "Project cong khai") : tr(language, "Private project", "Project rieng tu")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {project.metadata.mode === "team" && activeUsers.length ? (
                <div className="flex items-center -space-x-2">
                  {activeUsers.slice(0, 6).map((activeUser) => (
                    <div
                      key={activeUser.userId}
                      title={`${activeUser.name} • ${activeUser.status}`}
                      className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-xs font-semibold text-slate-700 shadow-sm"
                      style={activeUser.profileImageUrl ? { backgroundImage: `url(${activeUser.profileImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                    >
                      {!activeUser.profileImageUrl ? activeUser.name.slice(0, 2).toUpperCase() : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <button type="button" onClick={onOpenProjectManager} className={`rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 ${pressableClass}`}>
                {tr(language, "Manage Project", "Quan ly project")}
              </button>
              <button type="button" onClick={onSave} disabled={!canEdit || loadingSave} className={`rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${pressableClass}`}>
                {loadingSave ? tr(language, "Saving...", "Dang luu...") : canEdit ? tr(language, "Save", "Luu") : tr(language, "Read only", "Chi doc")}
              </button>
            </div>
          </div>

          {!canEdit ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {tr(language, "This public or low-permission project is view only. Editing is disabled for your account.", "Project cong khai hoac quyen thap chi cho phep xem. Ban khong the chinh sua.")}
            </div>
          ) : null}

          <EditorFormattingToolbar
            language={language}
            disabled={!canEdit}
            onBold={onBold}
            onItalic={onItalic}
            onUnderline={onUnderline}
            onBullet={onBullet}
            onAlign={onAlign}
            onFontSizeChange={onFontSizeChange}
            onImage={onInsertImage}
            onCrop={onCropImage}
            onColor={onApplyColor}
            onInsertTable={onInsertTable}
            onAddTableRow={onAddTableRow}
            onAddTableColumn={onAddTableColumn}
            onExport={onExport}
          />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.34fr)]">
            <div className="relative min-w-0">
              <div
                ref={editorSurfaceRef}
                contentEditable={canEdit}
                suppressContentEditableWarning
                onMouseDown={onBlankAreaMouseDown}
                onInput={onContentInput}
                data-placeholder={tr(language, "Start writing your chapter here...", "Bat dau viet chapter tai day...")}
                className="editor-surface h-[76vh] overflow-y-auto rounded-[28px] border border-slate-200 bg-[#fbfbfa] px-6 py-6 text-[1rem] leading-8 text-slate-700 outline-none focus:bg-white"
              />
              {loadingGenerate ? <EditorLoadingOverlay /> : null}
            </div>

            <aside className="min-w-0 rounded-[28px] border border-slate-200 bg-[#fbfbfa] p-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">{tr(language, "Chapters", "Chapters")}</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-400">{visibleChapters.length}</span>
                  <button type="button" disabled={!canEdit} onClick={onCreateChapter} className={`rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-60 ${pressableClass}`}>
                    {tr(language, "New", "Moi")}
                  </button>
                </div>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                {project.branches.map((branch) => (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => onSelectBranch(branch.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${pressableClass} ${activeBranchId === branch.id ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
              <div className="mb-4 rounded-2xl bg-white p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{tr(language, "Chapter title", "Ten chapter")}</p>
                <input
                  value={editorTitle}
                  onChange={(event) => onTitleChange(event.target.value)}
                  placeholder={tr(language, "Untitled chapter", "Untitled chapter")}
                  disabled={!canEdit}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-800 disabled:opacity-60"
                />
              </div>
              <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "62vh" }}>
                {visibleChapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    className={`rounded-2xl border px-3 py-3 text-sm ${selectedChapterId === chapter.id ? "border-slate-900 bg-white text-slate-900" : "border-transparent bg-white/80 text-slate-500 hover:bg-white"}`}
                  >
                    <div className="flex items-start gap-2">
                      <button type="button" onClick={() => onSelectChapter(chapter.id)} className={`min-w-0 flex-1 text-left ${pressableClass}`}>
                        <p className="truncate font-medium">{chapter.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{tr(language, "Chapter", "Chapter")} {chapter.index}</p>
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => onDeleteChapter(chapter.id)}
                        className={`rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 disabled:opacity-50 ${pressableClass}`}
                        title={tr(language, "Delete chapter", "Xoa chapter")}
                      >
                        X
                      </button>
                    </div>
                  </div>
                ))}
                {!visibleChapters.length ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                    {tr(language, "No chapters in this branch yet. Press New to create one instantly.", "Nhan New de tao chapter moi ngay lap tuc.")}
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

function OverlayShell({
  title,
  onClose,
  sidebar,
  children,
}: {
  title: string;
  onClose: () => void;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/18 px-2 py-2 backdrop-blur-[2px]">
      <div className="flex h-[calc(100vh-1rem)] w-full max-w-[1560px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.18)]">
        <aside className="w-[18.5rem] shrink-0 border-r border-slate-200 bg-[#fbfbfa] p-4">{sidebar}</aside>
        <section className="min-w-0 flex-1 overflow-y-auto p-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Workspace</p>
              <h2 className="mt-2 text-[2.1rem] font-semibold tracking-[-0.04em] text-slate-900">{title}</h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-500">
              Close
            </button>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}

function ProjectsOverlay({
  language,
  projects,
  project,
  selectedProjectId,
  accent,
  loadingCreate,
  loadingVisibility,
  showCreateProjectForm,
  canManage,
  onClose,
  onSelectProject,
  onToggleCreateForm,
  onCreateProject,
  onTogglePublic,
}: {
  language: UiLanguage;
  projects: ProjectSummary[];
  project: ProjectDocument | null;
  selectedProjectId?: string;
  accent: string;
  loadingCreate: boolean;
  loadingVisibility: boolean;
  showCreateProjectForm: boolean;
  canManage: boolean;
  onClose: () => void;
  onSelectProject: (projectId: string) => void;
  onToggleCreateForm: () => void;
  onCreateProject: (payload: { name: string; mode: "personal" | "team"; genre: string; summary: string }) => void;
  onTogglePublic: (isPublic: boolean) => void;
}) {
  return (
    <OverlayShell
      title="Projects"
      onClose={onClose}
      sidebar={
        <div>
          <button type="button" onClick={onToggleCreateForm} disabled={!canManage} className={`mb-4 w-full rounded-2xl px-4 py-3 text-sm font-medium text-white disabled:opacity-60 ${pressableClass}`} style={{ backgroundColor: accent }}>
            {showCreateProjectForm ? tr(language, "Hide create form", "An form tao") : tr(language, "New project", "Project moi")}
          </button>
          <div className="space-y-1">
            {projects.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectProject(item.id)}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm ${pressableClass} ${selectedProjectId === item.id ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:bg-white"}`}
              >
                <p className="truncate font-medium">{item.name}</p>
                <p className="truncate text-xs text-slate-400">{item.genre}</p>
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {showCreateProjectForm ? (
            <ProjectCreateForm onSubmit={onCreateProject} loading={loadingCreate} />
          ) : project ? (
            <div className="space-y-5">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm text-slate-400">Current project</p>
                
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">{project.metadata.name}</h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">{project.metadata.summary}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard label="Genre" value={project.metadata.genre} />
                <StatCard label="Branches" value={String(project.branches.length)} />
                <StatCard label="Chapters" value={String(project.chapters.length)} />
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 p-6 text-sm text-slate-500">{tr(language, "Select a project or create a new one.", "Chon mot project hoac tao project moi.")}</div>
          )}
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700">{tr(language, "Visibility", "Hien thi")}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{tr(language, "Publish a project so other users can discover it in the Home overview.", "Dang cong khai de nguoi khac co the tim thay project trong trang Home.")}</p>
          <div className="mt-5 flex gap-3">
            <button type="button" disabled={!project || !canManage || loadingVisibility} onClick={() => onTogglePublic(false)} className={`flex-1 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-60 ${pressableClass}`}>
              {tr(language, "Private", "Rieng tu")}
            </button>
            <button type="button" disabled={!project || !canManage || loadingVisibility} onClick={() => onTogglePublic(true)} className={`flex-1 rounded-2xl px-4 py-3 text-sm font-medium text-white disabled:opacity-60 ${pressableClass}`} style={{ backgroundColor: accent }}>
              {tr(language, "Public", "Cong khai")}
            </button>
          </div>
          {project ? <p className="mt-3 text-xs text-slate-400">Current: {project.metadata.isPublic ? "Public" : "Private"}{!canManage ? " • You can view but not manage this project." : ""}</p> : null}
        </div>
      </div>
    </OverlayShell>
  );
}

function SettingsOverlay({
  language,
  user,
  settings,
  section,
  setSection,
  themeId,
  setThemeId,
  fontId,
  setFontId,
  onClose,
  onLogout,
  onUpdateAccount,
  onSaveSettings,
}: {
  language: UiLanguage;
  user: AuthUser;
  settings: UserSettings;
  section: SettingsSection;
  setSection: (section: SettingsSection) => void;
  themeId: (typeof themeOptions)[number]["id"];
  setThemeId: (themeId: (typeof themeOptions)[number]["id"]) => void;
  fontId: (typeof fontOptions)[number]["id"];
  setFontId: (fontId: (typeof fontOptions)[number]["id"]) => void;
  onClose: () => void;
  onLogout: () => void;
  onUpdateAccount: (payload: {
    name?: string;
    dateOfBirth?: string;
    profileImageUrl?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<void>;
  onSaveSettings: (settings: UserSettings) => Promise<void>;
}) {
  const [draftSettings, setDraftSettings] = useState<UserSettings>(settings);
  const [accountForm, setAccountForm] = useState({
    name: user.name,
    dateOfBirth: user.dateOfBirth || "",
    profileImageUrl: user.profileImageUrl || "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
  });

  useEffect(() => {
    setDraftSettings(settings);
  }, [settings]);

  useEffect(() => {
    setAccountForm({
      name: user.name,
      dateOfBirth: user.dateOfBirth || "",
      profileImageUrl: user.profileImageUrl || "",
    });
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
    });
  }, [user]);

  return (
    <OverlayShell
      title="Preferences"
      onClose={onClose}
      sidebar={
        <div className="space-y-1">
          <div className="mb-4 rounded-2xl bg-white p-3 shadow-sm">
            <p className="font-semibold text-slate-800">{user.name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
          {[
            { id: "appearance", label: tr(language, "Appearance", "Giao diện") },
            { id: "language", label: tr(language, "Language & Time", "Ngôn ngữ và giờ") },
            { id: "security", label: tr(language, "Security", "Bảo mật") },
            { id: "account", label: tr(language, "Account", "Tài khoản") },
          ].map((item) => (
            <button key={item.id} type="button" onClick={() => setSection(item.id as SettingsSection)} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm ${pressableClass} ${section === item.id ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:bg-white"}`}>
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      {section === "appearance" ? (
        <div className="space-y-8">
          <PreferenceSection title={tr(language, "Theme", "Giao diện màu")}>
            <div className="grid gap-3 md:grid-cols-2">
              {themeOptions.map((option) => (
                <button key={option.id} type="button" onClick={() => setThemeId(option.id)} className="rounded-[22px] border px-4 py-4 text-left" style={{ borderColor: themeId === option.id ? option.accent : "#e2e8f0", backgroundColor: option.shell }}>
                  <div className="mb-3 flex gap-2">
                    <span className="h-5 w-5 rounded-full" style={{ backgroundColor: option.accent }} />
                    <span className="h-5 w-5 rounded-full border border-black/5" style={{ backgroundColor: option.page }} />
                  </div>
                  <p className="font-semibold text-slate-800">{option.label}</p>
                </button>
              ))}
            </div>
          </PreferenceSection>
          <PreferenceSection title={tr(language, "Font", "Phông chữ")}>
            <div className="grid gap-3 md:grid-cols-2">
              {fontOptions.map((option) => (
                <button key={option.id} type="button" onClick={() => setFontId(option.id)} className={`rounded-[22px] border px-4 py-4 text-left ${option.className}`} style={{ borderColor: fontId === option.id ? "#111827" : "#e2e8f0", backgroundColor: fontId === option.id ? "#f8fafc" : "#ffffff" }}>
                  <p className="font-semibold">{option.label}</p>
                </button>
              ))}
            </div>
          </PreferenceSection>
        </div>
      ) : null}

      {section === "language" ? (
        <div className="space-y-8">
          <PreferenceSection title={tr(language, "Language", "Ngôn ngữ")}>
            <div className="grid gap-3 md:grid-cols-2">
              <button type="button" onClick={() => setDraftSettings((current) => ({ ...current, language: "en-US" }))} className={`rounded-2xl border px-4 py-3 text-left text-sm ${draftSettings.language === "en-US" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>English (US)</button>
              <button type="button" onClick={() => setDraftSettings((current) => ({ ...current, language: "vi-VN" }))} className={`rounded-2xl border px-4 py-3 text-left text-sm ${draftSettings.language === "vi-VN" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>Tiếng Việt</button>
            </div>
          </PreferenceSection>
          <PreferenceSection title={tr(language, "Time zone", "Múi giờ")}>
            <select value={draftSettings.timeZone} onChange={(event) => setDraftSettings((current) => ({ ...current, timeZone: event.target.value }))} className="w-full max-w-sm rounded-2xl border border-slate-300 px-4 py-3">
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </PreferenceSection>
          <button type="button" onClick={() => void onSaveSettings(draftSettings)} className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white">
            {tr(language, "Save language & time", "Lưu ngôn ngữ và giờ")}
          </button>
        </div>
      ) : null}

      {section === "security" ? (
        <div className="space-y-8">
          <PreferenceSection title={tr(language, "Security mode", "Chế độ bảo mật")}>
            <div className="grid gap-3 md:grid-cols-2">
              <button type="button" onClick={() => setDraftSettings((current) => ({ ...current, securityMode: "standard" }))} className={`rounded-2xl border px-4 py-4 text-left ${pressableClass} ${draftSettings.securityMode === "standard" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                <p className="font-semibold text-slate-800">Standard</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Balanced access for daily writing and collaboration.</p>
              </button>
              <button type="button" onClick={() => setDraftSettings((current) => ({ ...current, securityMode: "strict" }))} className={`rounded-2xl border px-4 py-4 text-left ${pressableClass} ${draftSettings.securityMode === "strict" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                <p className="font-semibold text-slate-800">Strict</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Favor private workspaces and tighter collaboration access.</p>
              </button>
            </div>
          </PreferenceSection>
          <PreferenceSection title={tr(language, "Change password", "Đổi mật khẩu")}>
            <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <input value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} type="password" placeholder={tr(language, "Current password", "Mật khẩu hiện tại")} className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
              <input value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} type="password" placeholder={tr(language, "New password", "Mật khẩu mới")} className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
              <button
                type="button"
                onClick={async () => {
                  await onUpdateAccount({
                    currentPassword: passwordForm.currentPassword,
                    newPassword: passwordForm.newPassword,
                  });
                  setPasswordForm({
                    currentPassword: "",
                    newPassword: "",
                  });
                }}
                className={`rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white ${pressableClass}`}
              >
                {tr(language, "Save password", "Lưu mật khẩu")}
              </button>
            </div>
          </PreferenceSection>
          <button type="button" onClick={() => void onSaveSettings(draftSettings)} className={`rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white ${pressableClass}`}>
            {tr(language, "Save security", "Lưu bảo mật")}
          </button>
        </div>
      ) : null}

      {section === "account" ? (
        <div className="space-y-6">
          <PreferenceSection title={tr(language, "Account", "Tài khoản")}>
            <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white text-2xl font-semibold text-slate-500">
                  {accountForm.profileImageUrl ? (
                    <img src={accountForm.profileImageUrl} alt={accountForm.name} className="h-full w-full object-cover" />
                  ) : (
                    accountForm.name.charAt(0).toUpperCase()
                  )}
                </div>
                <p className="text-lg font-semibold text-slate-800">{accountForm.name}</p>
                <p className="mt-1 text-sm text-slate-500">{user.email}</p>
              </div>
              <div className="space-y-4">
                <input value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} placeholder={tr(language, "Full name", "Họ và tên")} className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
                <input value={user.email} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500" />
                <input value={accountForm.dateOfBirth} onChange={(event) => setAccountForm((current) => ({ ...current, dateOfBirth: event.target.value }))} type="date" className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
                <label className="block rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  <span className="mb-3 block font-medium text-slate-700">{tr(language, "Profile image", "Ảnh đại diện")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }

                      const imageData = await readFileAsDataUrl(file);
                      setAccountForm((current) => ({ ...current, profileImageUrl: imageData }));
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    await onUpdateAccount({
                      name: accountForm.name,
                      dateOfBirth: accountForm.dateOfBirth,
                      profileImageUrl: accountForm.profileImageUrl,
                    });
                  }}
                  className={`rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white ${pressableClass}`}
                >
                  {tr(language, "Save account", "Lưu tài khoản")}
                </button>
                <button type="button" onClick={onLogout} className={`rounded-full border border-rose-200 px-5 py-2.5 text-sm font-medium text-rose-600 ${pressableClass}`}>
                  {tr(language, "Logout", "Đăng xuất")}
                </button>
              </div>
            </div>
          </PreferenceSection>
        </div>
      ) : null}
    </OverlayShell>
  );
}

function PeopleOverlay({
  language,
  accent,
  users,
  incomingRequests,
  outgoingRequests,
  onClose,
  runAction,
  onSocialChanged,
  onOpenFriend,
}: {
  language: UiLanguage;
  accent: string;
  users: UserDirectoryItem[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  onClose: () => void;
  runAction: (actionKey: string, action: () => Promise<void>, successMessage?: string) => Promise<void>;
  onSocialChanged: (overview: SocialOverview) => void;
  onOpenFriend: (friendId: string) => void;
}) {
  const [emailQuery, setEmailQuery] = useState("");
  const visibleUsers = users.filter((person) => person.email.toLowerCase().includes(emailQuery.trim().toLowerCase()));

  return (
    <OverlayShell
      title={tr(language, "People", "People")}
      onClose={onClose}
      sidebar={
        <div className="space-y-3">
          <input
            value={emailQuery}
            onChange={(event) => setEmailQuery(event.target.value)}
            placeholder={tr(language, "Find by email", "Tim theo email")}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700"
          />
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">{tr(language, "Directory", "Danh ba")}: {visibleUsers.length}</div>
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">{tr(language, "Incoming requests", "Loi moi den")}: {incomingRequests.filter((item) => item.status === "pending").length}</div>
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">{tr(language, "Outgoing requests", "Loi moi da gui")}: {outgoingRequests.filter((item) => item.status === "pending").length}</div>
        </div>
      }
    >
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-slate-900">{tr(language, "Discover people", "Kham pha moi nguoi")}</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{visibleUsers.length} {tr(language, "users", "nguoi")}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {visibleUsers.map((person) => {
              const hasOutgoingRequest = outgoingRequests.some((item) => item.receiverId === person.id && item.status === "pending");
              const hasIncomingRequest = incomingRequests.some((item) => item.senderId === person.id && item.status === "pending");
              return (
                <div key={person.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 shadow-sm" style={person.profileImageUrl ? { backgroundImage: `url(${person.profileImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                      {!person.profileImageUrl ? person.name.slice(0, 2).toUpperCase() : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{person.name}</p>
                      <p className="truncate text-sm text-slate-500">{person.email}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {person.isFriend ? (
                      <button type="button" onClick={() => onOpenFriend(person.id)} className={`rounded-full bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ${pressableClass}`}>
                        {tr(language, "Open friend chat", "Mo chat")}
                      </button>
                    ) : hasIncomingRequest ? (
                      <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">{tr(language, "Waiting for your reply", "Dang cho ban tra loi")}</span>
                    ) : hasOutgoingRequest ? (
                      <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">{tr(language, "Request sent", "Da gui loi moi")}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void runAction("friend-request", async () => {
                          const next = await api.sendFriendRequest(person.id);
                          onSocialChanged(next);
                        }, tr(language, "Friend request sent", "Da gui loi moi ket ban"))}
                        className={`rounded-full px-3 py-2 text-xs font-medium text-white ${pressableClass}`}
                        style={{ backgroundColor: accent }}
                      >
                        {tr(language, "Send request", "Gui loi moi")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!visibleUsers.length ? (
              <div className="rounded-[24px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                {tr(language, "No user matches this email.", "Khong co nguoi dung nao khop email nay.")}
              </div>
            ) : null}
          </div>
        </section>

        <section>
          <h3 className="mb-4 text-xl font-semibold text-slate-900">{tr(language, "Incoming requests", "Loi moi den")}</h3>
          <div className="space-y-3">
            {incomingRequests.length ? incomingRequests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                <div>
                  <p className="font-semibold text-slate-800">{request.senderName}</p>
                  <p className="text-sm text-slate-500">{request.senderEmail}</p>
                </div>
                {request.status === "pending" ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void runAction("accept-friend", async () => {
                      const next = await api.respondToFriendRequest(request.id, "accepted");
                      onSocialChanged(next);
                    }, tr(language, "Friend request accepted", "Da chap nhan loi moi"))} className={`rounded-full px-4 py-2 text-sm font-medium text-white ${pressableClass}`} style={{ backgroundColor: accent }}>
                      {tr(language, "Accept", "Chap nhan")}
                    </button>
                    <button type="button" onClick={() => void runAction("reject-friend", async () => {
                      const next = await api.respondToFriendRequest(request.id, "rejected");
                      onSocialChanged(next);
                    }, tr(language, "Friend request rejected", "Da tu choi loi moi"))} className={`rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 ${pressableClass}`}>
                      {tr(language, "Reject", "Tu choi")}
                    </button>
                  </div>
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{request.status}</span>
                )}
              </div>
            )) : (
              <div className="rounded-[24px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">{tr(language, "No incoming requests right now.", "Hien khong co loi moi nao.")}</div>
            )}
          </div>
        </section>
      </div>
    </OverlayShell>
  );
}

function FriendsOverlay({
  language,
  user,
  accent,
  friends,
  selectedFriendId,
  directMessages,
  onClose,
  onSelectFriend,
  runAction,
  onMessagesChanged,
}: {
  language: UiLanguage;
  user: AuthUser;
  accent: string;
  friends: AuthUser[];
  selectedFriendId?: string;
  directMessages: DirectMessage[];
  onClose: () => void;
  onSelectFriend: (friendId: string | undefined) => void;
  runAction: (actionKey: string, action: () => Promise<void>, successMessage?: string) => Promise<void>;
  onMessagesChanged: (messages: DirectMessage[]) => void;
}) {
  const selectedFriend = friends.find((friend) => friend.id === selectedFriendId);
  const currentFriend = selectedFriend ?? friends[0];
  const fileInputId = "friend-chat-file";
  const [draftMessage, setDraftMessage] = useState("");

  useEffect(() => {
    if (!selectedFriendId && friends[0]) {
      onSelectFriend(friends[0].id);
    }
  }, [friends, onSelectFriend, selectedFriendId]);

  useEffect(() => {
    setDraftMessage("");
  }, [currentFriend?.id]);

  return (
    <OverlayShell
      title={tr(language, "Friends", "Friends")}
      onClose={onClose}
      sidebar={
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{tr(language, "Friends", "Friends")}</p>
          <div className="space-y-1">
            {friends.map((friend) => (
              <button
                key={friend.id}
                type="button"
                onClick={() => onSelectFriend(friend.id)}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm ${pressableClass} ${currentFriend?.id === friend.id ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:bg-white"}`}
              >
                <p className="truncate font-medium">{friend.name}</p>
                <p className="truncate text-xs text-slate-400">{friend.email}</p>
              </button>
            ))}
            {!friends.length ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{tr(language, "No friends yet. Use People to send friend requests.", "Chua co ban be. Vao People de gui loi moi.")}</div> : null}
          </div>
        </div>
      }
    >
      <div className="flex h-[calc(100vh-13rem)] flex-col rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-sm text-slate-400">{tr(language, "Private messages", "Tin nhan rieng")}</p>
            <h3 className="mt-2 text-[2rem] font-semibold tracking-[-0.03em] text-slate-900">{currentFriend?.name || tr(language, "Choose a friend", "Chon mot nguoi ban")}</h3>
            <p className="mt-1 text-sm text-slate-500">{currentFriend?.email || tr(language, "Select one of your connected friends to open chat.", "Chon mot nguoi ban de mo chat.")}</p>
          </div>
        </div>
        <div className="mb-5 min-h-0 flex-1 space-y-3 overflow-y-auto rounded-[24px] border border-slate-200 bg-[#fbfbfa] p-4">
          {currentFriend ? directMessages.map((message) => (
            <div key={message.id} className={`max-w-[85%] rounded-[24px] px-4 py-3 ${message.senderId === user.id ? "ml-auto bg-blue-50" : "bg-white"}`}>
              <p className="text-xs text-slate-400">{formatDateTime(message.createdAt)}</p>
              {message.content ? <p className="mt-1 text-sm leading-6 text-slate-700">{message.content}</p> : null}
              {message.fileUrl ? (
                <a href={message.fileUrl} download={message.fileName || true} className="mt-2 inline-flex rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700">
                  {message.fileName || "Download file"}
                </a>
              ) : null}
            </div>
          )) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">{tr(language, "Select a friend to start chatting.", "Chon mot nguoi ban de bat dau chat.")}</div>
          )}
        </div>

        {currentFriend ? (
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const file = form.get("file");
              await runAction("send-direct-message", async () => {
                const result = await api.sendDirectMessage(currentFriend.id, {
                  content: draftMessage,
                  fileName: file instanceof File && file.size ? file.name : undefined,
                  fileUrl: file instanceof File && file.size ? await readFileAsDataUrl(file) : undefined,
                });
                onMessagesChanged(result.messages);
                setDraftMessage("");
              }, tr(language, "Message sent", "Da gui tin nhan"));
              event.currentTarget.reset();
            }}
          >
            <div className="flex items-center gap-3">
              <input value={draftMessage} onChange={(event) => setDraftMessage(event.target.value)} placeholder={tr(language, "Write a private message...", "Nhap tin nhan rieng...")} className="min-w-0 flex-1 rounded-[24px] border border-slate-300 bg-white px-4 py-3" />
              <label htmlFor={fileInputId} className={`cursor-pointer rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 ${pressableClass}`}>
                {tr(language, "File", "File")}
              </label>
              <input id={fileInputId} name="file" type="file" className="hidden" />
              <button type="submit" className={`ml-auto rounded-full px-5 py-2.5 text-sm font-medium text-white ${pressableClass}`} style={{ backgroundColor: accent }}>
                {tr(language, "Send", "Gui")}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </OverlayShell>
  );
}

function WorkspaceOverlay({
  project,
  accent,
  onClose,
}: {
  project: ProjectDocument | null;
  accent: string;
  onClose: () => void;
}) {
  return (
    <OverlayShell
      title="Workspace"
      onClose={onClose}
      sidebar={
        <div className="space-y-2 text-sm text-slate-600">
          <p className="rounded-xl bg-white px-3 py-2.5 shadow-sm">Characters</p>
          <p className="rounded-xl bg-white px-3 py-2.5 shadow-sm">Collaborators</p>
          <p className="rounded-xl bg-white px-3 py-2.5 shadow-sm">Branches</p>
        </div>
      }
    >
      {project ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-[24px] border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-700">Characters</p>
            <div className="mt-4 space-y-3">
              {project.characters.length ? project.characters.map((character) => (
                <div key={character.id} className="rounded-2xl bg-slate-50 p-4">
                  <p className="font-semibold text-slate-800">{character.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{character.role}</p>
                </div>
              )) : <p className="text-sm text-slate-500">No characters yet. Use the Character tool to add them.</p>}
            </div>
          </div>
          <div className="rounded-[24px] border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-700">Collaborators</p>
            <div className="mt-4 space-y-3">
              {project.collaborators.map((collaborator) => (
                <div key={collaborator.id} className="rounded-2xl bg-slate-50 p-4">
                  <p className="font-semibold text-slate-800">{collaborator.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{collaborator.email} • {collaborator.role}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[24px] border border-slate-200 p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Branches</p>
              <span className="rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: accent }}>{project.branches.length} total</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {project.branches.map((branch) => (
                <div key={branch.id} className="rounded-2xl bg-slate-50 p-4">
                  <p className="font-semibold text-slate-800">{branch.name}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{branch.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-slate-300 p-6 text-sm text-slate-500">Select a project before opening the workspace panel.</div>
      )}
    </OverlayShell>
  );
}

function FloatingToolDock({
  activePanel,
  drawerOpen,
  accent,
  onSelect,
}: {
  activePanel: ToolPanel;
  drawerOpen: boolean;
  accent: string;
  onSelect: (panel: ToolPanel) => void;
}) {
  return (
    <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-3">
      {toolItems.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={`group flex h-14 w-14 items-center justify-center rounded-full border border-white/60 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.14)] ${pressableClass}`}
          style={drawerOpen && activePanel === item.id ? { backgroundColor: accent } : undefined}
          title={item.label}
        >
          <img
            src={item.icon}
            alt={item.label}
            className="h-6 w-6 object-contain"
            style={drawerOpen && activePanel === item.id ? { filter: "brightness(0) invert(1)" } : undefined}
          />
          <span className="pointer-events-none absolute right-[4.25rem] hidden rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white group-hover:block">
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function ToolDrawer({
  project,
  user,
  activeBranchId,
  activePanel,
  accent,
  generateCooldownSeconds,
  loading,
  chatMessages,
  onClose,
  onGenerated,
  onChanged,
  onChatChanged,
  runAction,
}: {
  project: ProjectDocument | null;
  user: AuthUser;
  activeBranchId: string;
  activePanel: ToolPanel;
  accent: string;
  generateCooldownSeconds: number;
  loading: (key: string) => boolean;
  chatMessages: ProjectChatMessage[];
  onClose: () => void;
  onGenerated: (project: ProjectDocument) => void;
  onChanged: (project: ProjectDocument) => void;
  onChatChanged: (messages: ProjectChatMessage[]) => void;
  runAction: (actionKey: string, action: () => Promise<void>, successMessage?: string) => Promise<void>;
}) {
  return (
    <aside className="absolute bottom-6 right-24 z-20 flex max-h-[calc(100%-6rem)] w-[24rem] flex-col overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{toolItems.find((item) => item.id === activePanel)?.label}</h3>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
            Close
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {activePanel === "generate" ? (
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!project || generateCooldownSeconds > 0) return;
              const form = new FormData(event.currentTarget);
              await runAction(
                "generate",
                async () => {
                  const updated = await api.generateChapter(project.metadata.id, {
                    title: String(form.get("title") || ""),
                    instructions: String(form.get("instructions") || ""),
                    branchId: activeBranchId,
                    actor: user.email,
                  });
                  onGenerated(updated);
                },
                "Chapter generated",
              );
              event.currentTarget.reset();
            }}
          >
            <input name="title" placeholder="New chapter title" required className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
            <textarea name="instructions" placeholder="Describe the next scene or direction..." rows={6} required className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
            <button type="submit" disabled={!project || !project.viewerAccess?.canEdit || loading("generate") || generateCooldownSeconds > 0} className="w-full rounded-2xl px-4 py-3 text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: accent }}>
              {loading("generate") ? "Generating..." : generateCooldownSeconds > 0 ? `Wait ${generateCooldownSeconds}s` : "Generate"}
            </button>
            <p className="text-xs leading-5 text-slate-400">
              Every AI chapter stores the branch context, recent continuity, and the instructions used for generation in backend chapter metadata.
            </p>
          </form>
        ) : null}

        {activePanel === "context" ? (
          <form
            key={project?.contextMemory.updatedAt || "context"}
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!project) return;
              const form = new FormData(event.currentTarget);
              await runAction(
                "save-context",
                async () => {
                  const updated = await api.updateContext(project.metadata.id, {
                    tone: String(form.get("tone") || ""),
                    audience: String(form.get("audience") || ""),
                    sharedNotes: String(form.get("sharedNotes") || ""),
                    worldRules: String(form.get("worldRules") || "").split("\n").map((value) => value.trim()).filter(Boolean),
                  });
                  onChanged(updated);
                },
                "Context updated",
              );
            }}
          >
            <input name="tone" defaultValue={project?.contextMemory.tone} placeholder="Tone" className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
            <input name="audience" defaultValue={project?.contextMemory.audience} placeholder="Audience" className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
            <textarea name="sharedNotes" defaultValue={project?.contextMemory.sharedNotes} placeholder="Shared notes" rows={4} className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
            <textarea name="worldRules" defaultValue={project?.contextMemory.worldRules.join("\n")} placeholder="One world rule per line" rows={4} className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
            <button type="submit" disabled={!project || !project.viewerAccess?.canEdit || loading("save-context")} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-60">
              {loading("save-context") ? "Saving..." : "Save context"}
            </button>
          </form>
        ) : null}

        {activePanel === "character" ? <CharacterPanel project={project} loading={loading} onChanged={onChanged} runAction={runAction} accent={accent} /> : null}
        {activePanel === "chat" ? <ProjectChatPanel project={project} user={user} loading={loading} runAction={runAction} messages={chatMessages} onMessagesChanged={onChatChanged} accent={accent} /> : null}
        {activePanel === "history" ? <HistoryPanel project={project} loading={loading} onChanged={onChanged} runAction={runAction} accent={accent} /> : null}
      </div>
    </aside>
  );
}

function ProjectCreateForm({
  onSubmit,
  loading,
}: {
  onSubmit: (payload: { name: string; mode: "personal" | "team"; genre: string; summary: string }) => void;
  loading: boolean;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit({
          name: String(form.get("name") || ""),
          mode: String(form.get("mode") || "personal") as "personal" | "team",
          genre: String(form.get("genre") || ""),
          summary: String(form.get("summary") || ""),
        });
      }}
    >
      <p className="text-sm font-semibold text-slate-700">Create project</p>
      <input name="name" placeholder="Project name" required className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
      <select name="mode" className="w-full rounded-2xl border border-slate-300 px-4 py-3">
        <option value="personal">Personal</option>
        <option value="team">Team</option>
      </select>
      <input name="genre" placeholder="Genre" required className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
      <textarea name="summary" placeholder="Summary" rows={4} className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
      <button type="submit" disabled={loading} className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
        {loading ? "Creating..." : "Create project"}
      </button>
    </form>
  );
}

function EditorFormattingToolbar({
  language,
  disabled,
  onBold,
  onItalic,
  onUnderline,
  onBullet,
  onAlign,
  onFontSizeChange,
  onImage,
  onCrop,
  onColor,
  onInsertTable,
  onAddTableRow,
  onAddTableColumn,
  onExport,
}: {
  language: UiLanguage;
  disabled: boolean;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onBullet: () => void;
  onAlign: (align: "left" | "center" | "right") => void;
  onFontSizeChange: (size: number) => void;
  onImage: () => void;
  onCrop: () => void;
  onColor: (color: string) => void;
  onInsertTable: () => void;
  onAddTableRow: () => void;
  onAddTableColumn: () => void;
  onExport: () => void;
}) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#111827");

  return (
    <div className="mb-5 grid gap-3 rounded-[24px] border border-slate-200 bg-[#fbfbfa] px-3 py-3 xl:grid-cols-[1.45fr_0.85fr_0.9fr_0.42fr]">
      <div className="rounded-[20px] border border-slate-200 bg-white p-3">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr(language, "Font", "Phông chữ")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={disabled} onClick={onBold} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50 ${pressableClass}`}><span className="font-black">B</span></button>
          <button type="button" disabled={disabled} onClick={onItalic} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50 ${pressableClass}`}><span className="italic">I</span></button>
          <button type="button" disabled={disabled} onClick={onUnderline} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50 ${pressableClass}`}><span className="underline">U</span></button>
          <select
            disabled={disabled}
            defaultValue="16"
            onChange={(event) => onFontSizeChange(Number(event.target.value))}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            {Array.from({ length: 43 }, (_, index) => index + 8).map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </select>
          <div className="relative">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setColorPickerOpen((current) => !current)}
              className={`flex h-10 min-w-10 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-slate-800 disabled:opacity-50 ${pressableClass}`}
              title={tr(language, "Text color", "Màu chữ")}
            >
              <span className="relative inline-flex h-7 w-5 items-center justify-center text-[1.4rem] leading-none">
                A
                <span className="absolute bottom-0 left-0 h-[3px] w-full rounded-full" style={{ backgroundColor: selectedColor }} />
              </span>
            </button>
            {colorPickerOpen ? (
              <div className="absolute left-0 top-[calc(100%+0.6rem)] z-20 w-[260px] rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_24px_50px_rgba(15,23,42,0.14)]">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{tr(language, "Theme colors", "Màu chủ đề")}</p>
                <div className="grid grid-cols-3 gap-2">
                  {presetTextColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        setSelectedColor(color);
                        onColor(color);
                        setColorPickerOpen(false);
                      }}
                      className={`h-9 rounded-md border border-slate-200 ${pressableClass}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <label className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <span>{tr(language, "More colors", "Màu chi tiết")}</span>
                  <input
                    type="color"
                    disabled={disabled}
                    value={selectedColor}
                    className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                    onChange={(event) => {
                      setSelectedColor(event.target.value);
                      onColor(event.target.value);
                    }}
                  />
                </label>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-[20px] border border-slate-200 bg-white p-3">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr(language, "Paragraph", "Đoạn văn")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={disabled} onClick={onBullet} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 ${pressableClass}`}>{tr(language, "Bullet", "Bullet")}</button>
          <button type="button" disabled={disabled} onClick={() => onAlign("left")} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 ${pressableClass}`}>{tr(language, "Left", "Trai")}</button>
          <button type="button" disabled={disabled} onClick={() => onAlign("center")} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 ${pressableClass}`}>{tr(language, "Center", "Giua")}</button>
          <button type="button" disabled={disabled} onClick={() => onAlign("right")} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 ${pressableClass}`}>{tr(language, "Right", "Phai")}</button>
        </div>
      </div>

      <div className="rounded-[20px] border border-slate-200 bg-white p-3">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr(language, "Insert", "Chèn")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={disabled} onClick={onImage} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 ${pressableClass}`}>{tr(language, "Image", "Anh")}</button>
          <button type="button" disabled={disabled} onClick={onCrop} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 ${pressableClass}`}>{tr(language, "Crop", "Cắt ảnh")}</button>
          <button type="button" disabled={disabled} onClick={onInsertTable} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 ${pressableClass}`}>Table</button>
          <button type="button" disabled={disabled} onClick={onAddTableRow} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 ${pressableClass}`}>{tr(language, "+ Row", "+ Hàng")}</button>
          <button type="button" disabled={disabled} onClick={onAddTableColumn} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 ${pressableClass}`}>{tr(language, "+ Column", "+ Cột")}</button>
        </div>
      </div>

      <div className="rounded-[20px] border border-slate-200 bg-white p-3">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr(language, "Export", "Xuất")}</p>
        <button type="button" disabled={disabled} onClick={onExport} className={`w-full rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50 ${pressableClass}`}>
          PDF
        </button>
      </div>
    </div>
  );
}

function ProjectManagementOverlay({
  project,
  friends,
  accent,
  loading,
  onClose,
  onChanged,
  runAction,
}: {
  project: ProjectDocument;
  friends: AuthUser[];
  accent: string;
  loading: (key: string) => boolean;
  onClose: () => void;
  onChanged: (project: ProjectDocument) => void;
  runAction: (actionKey: string, action: () => Promise<void>, successMessage?: string) => Promise<void>;
}) {
  const canManage = project.viewerAccess?.canManage ?? false;
  const [section, setSection] = useState<"mode" | "publishing" | "branches" | "chapters" | "team">("mode");
  const [mode, setMode] = useState<"personal" | "team">(project.metadata.mode);
  const [isPublic, setIsPublic] = useState(project.metadata.isPublic);
  const [coverImageUrl, setCoverImageUrl] = useState(project.metadata.coverImageUrl || "");

  useEffect(() => {
    setMode(project.metadata.mode);
    setIsPublic(project.metadata.isPublic);
    setCoverImageUrl(project.metadata.coverImageUrl || "");
  }, [project]);

  return (
    <OverlayShell
      title="Manage Project"
      onClose={onClose}
      sidebar={
        <div className="space-y-4">
          <div className="rounded-[24px] bg-white p-4 shadow-sm">
            <div
              className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[20px] bg-slate-100 text-2xl font-semibold text-slate-500"
              style={coverImageUrl ? { backgroundImage: `url(${coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
            >
              {!coverImageUrl ? project.metadata.name.slice(0, 1).toUpperCase() : null}
            </div>
            <p className="font-semibold text-slate-900">{project.metadata.name}</p>
            <p className="mt-1 text-sm text-slate-500">{project.metadata.genre}</p>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            {[
              { id: "mode", label: "Workspace mode" },
              { id: "publishing", label: "Publishing" },
              { id: "branches", label: "Branches" },
              { id: "chapters", label: "Chapters" },
              { id: "team", label: "Team management" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id as typeof section)}
                className={`w-full rounded-xl px-3 py-2.5 text-left shadow-sm ${pressableClass} ${section === item.id ? "bg-slate-900 text-white" : "bg-white"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="space-y-8">
        {section === "mode" ? (
          <PreferenceSection title="Workspace mode">
            <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <button type="button" disabled={!canManage} onClick={() => setMode("personal")} className={`rounded-2xl border px-4 py-4 text-left ${mode === "personal" ? "border-slate-900 bg-white" : "border-slate-200 bg-white/70"} ${pressableClass}`}>
                  <p className="font-semibold text-slate-800">Personal</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">Only the owner edits the workspace.</p>
                </button>
                <button type="button" disabled={!canManage} onClick={() => setMode("team")} className={`rounded-2xl border px-4 py-4 text-left ${mode === "team" ? "border-slate-900 bg-white" : "border-slate-200 bg-white/70"} ${pressableClass}`}>
                  <p className="font-semibold text-slate-800">Team</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">Enable collaborators, presence, and team chat.</p>
                </button>
              </div>
              <button
                type="button"
                disabled={!canManage || loading("save-project-settings")}
                onClick={() =>
                  void runAction(
                    "save-project-settings",
                    async () => {
                      const updated = await api.updateProjectSettings(project.metadata.id, {
                        mode,
                        isPublic,
                        coverImageUrl: coverImageUrl || undefined,
                      });
                      onChanged(updated);
                    },
                    "Workspace mode updated",
                  )
                }
                className={`rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 ${pressableClass}`}
                style={{ backgroundColor: accent }}
              >
                {loading("save-project-settings") ? "Saving..." : "Save workspace mode"}
              </button>
            </div>
          </PreferenceSection>
        ) : null}

        {section === "publishing" ? (
          <PreferenceSection title="Publishing">
            <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <button type="button" disabled={!canManage} onClick={() => setIsPublic(false)} className={`rounded-2xl border px-4 py-4 text-left ${!isPublic ? "border-slate-900 bg-white" : "border-slate-200 bg-white/70"} ${pressableClass}`}>
                    <p className="font-semibold text-slate-800">Private</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Only permitted members can open this project.</p>
                  </button>
                  <button type="button" disabled={!canManage} onClick={() => setIsPublic(true)} className={`rounded-2xl border px-4 py-4 text-left ${isPublic ? "border-slate-900 bg-white" : "border-slate-200 bg-white/70"} ${pressableClass}`}>
                    <p className="font-semibold text-slate-800">Public</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Show this project on the public home feed with its image.</p>
                  </button>
                </div>

                <label className="block rounded-[24px] border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600">
                  <span className="mb-3 block font-medium text-slate-700">Project image</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!canManage}
                    className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      setCoverImageUrl(await readFileAsDataUrl(file));
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={!canManage || loading("save-project-settings")}
                  onClick={() =>
                    void runAction(
                      "save-project-settings",
                      async () => {
                        const updated = await api.updateProjectSettings(project.metadata.id, {
                          mode,
                          isPublic,
                          coverImageUrl: coverImageUrl || undefined,
                        });
                        onChanged(updated);
                      },
                      "Publishing updated",
                    )
                  }
                  className={`rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 ${pressableClass}`}
                  style={{ backgroundColor: accent }}
                >
                  {loading("save-project-settings") ? "Saving..." : "Save publishing"}
                </button>
              </div>
          </PreferenceSection>
        ) : null}

        {section === "branches" ? (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
            <PreferenceSection title="Create branch">
              <form
                className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!canManage) {
                    return;
                  }
                  const form = new FormData(event.currentTarget);
                  await runAction(
                    "create-branch",
                    async () => {
                      const updated = await api.createBranch(project.metadata.id, {
                        name: String(form.get("name") || ""),
                        description: String(form.get("description") || ""),
                        basedOnChapterId: String(form.get("basedOnChapterId") || "root"),
                      });
                      onChanged(updated);
                    },
                    "Branch created",
                  );
                  event.currentTarget.reset();
                }}
              >
                <input name="name" placeholder="Branch name" required disabled={!canManage} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:opacity-60" />
                <textarea name="description" placeholder="What diverges in this branch?" rows={3} disabled={!canManage} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:opacity-60" />
                <select name="basedOnChapterId" defaultValue={project.chapters.at(-1)?.id || "root"} disabled={!canManage} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:opacity-60">
                  <option value="root">Root</option>
                  {project.chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.title}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={!canManage || loading("create-branch")} className={`rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 ${pressableClass}`} style={{ backgroundColor: accent }}>
                  {loading("create-branch") ? "Creating..." : "Create branch"}
                </button>
              </form>
            </PreferenceSection>

            <PreferenceSection title="Current branches">
              <div className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-5">
                {project.branches.map((branch) => (
                  <div key={branch.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-800">{branch.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">{branch.status}</span>
                        {branch.id !== "main" && branch.status !== "merged" ? (
                          <button
                            type="button"
                            disabled={!canManage || loading("merge-branch")}
                            onClick={() =>
                              void runAction(
                                "merge-branch",
                                async () => {
                                  const updated = await api.mergeBranch(project.metadata.id, branch.id);
                                  onChanged(updated);
                                },
                                "Branch merged",
                              )
                            }
                            className={`rounded-full border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 disabled:opacity-60 ${pressableClass}`}
                          >
                            Merge
                          </button>
                        ) : null}
                        {branch.id !== "main" ? (
                          <button
                            type="button"
                            disabled={!canManage || loading("delete-branch")}
                            onClick={() =>
                              void runAction(
                                "delete-branch",
                                async () => {
                                  const updated = await api.deleteBranch(project.metadata.id, branch.id);
                                  onChanged(updated);
                                },
                                "Branch deleted",
                              )
                            }
                            className={`rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 disabled:opacity-60 ${pressableClass}`}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{branch.description}</p>
                  </div>
                ))}
              </div>
            </PreferenceSection>
          </div>
        ) : null}

        {section === "chapters" ? (
          <PreferenceSection title="Chapter management">
            <div className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-5">
              {project.chapters.map((chapter) => (
                <div key={chapter.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-800">{chapter.title}</p>
                    <p className="mt-1 text-xs text-slate-500">Branch: {project.branches.find((branch) => branch.id === chapter.branchId)?.name || chapter.branchId}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!canManage || loading("delete-chapter")}
                    onClick={() =>
                      void runAction(
                        "delete-chapter",
                        async () => {
                          const updated = await api.deleteChapter(project.metadata.id, chapter.id);
                          onChanged(updated);
                        },
                        "Chapter deleted",
                      )
                    }
                    className={`rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 disabled:opacity-60 ${pressableClass}`}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </PreferenceSection>
        ) : null}

        {section === "team" ? (
            <PreferenceSection title="Team management">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <TeamPanel project={project} friends={friends} loading={loading} onChanged={onChanged} runAction={runAction} accent={accent} />
              </div>
            </PreferenceSection>
        ) : null}
      </div>
    </OverlayShell>
  );
}

function PreferenceSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-4 text-xl font-semibold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-900">{value}</p>
    </div>
  );
}

function TeamPanel({
  project,
  friends,
  loading,
  onChanged,
  runAction,
  accent,
}: {
  project: ProjectDocument | null;
  friends: AuthUser[];
  loading: (key: string) => boolean;
  onChanged: (project: ProjectDocument) => void;
  runAction: (actionKey: string, action: () => Promise<void>, successMessage?: string) => Promise<void>;
  accent: string;
}) {
  const canManage = project?.viewerAccess?.canManage ?? false;

  return (
    <div className="space-y-5">
      {project?.metadata.mode === "team" ? (
        <>
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Members</p>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">{project.collaborators.length}</span>
            </div>
            <div className="space-y-2">
              {project.collaborators.map((collaborator) => (
                <div key={collaborator.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{collaborator.name}</p>
                    <p className="truncate text-xs text-slate-500">{collaborator.email}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{collaborator.role}</span>
                </div>
              ))}
            </div>
          </div>

          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!project || !canManage) return;
              const form = new FormData(event.currentTarget);
              await runAction("add-collaborator", async () => {
                const updated = await api.addCollaborator(project.metadata.id, {
                  friendUserId: String(form.get("friendUserId") || ""),
                  permissionLevel: Number(form.get("permissionLevel") || "1") as 1 | 2 | 3,
                });
                onChanged(updated);
              }, "Collaborator added");
              event.currentTarget.reset();
            }}
          >
            <select name="friendUserId" required disabled={!canManage || !friends.length} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60">
              <option value="">Select a friend to add</option>
              {friends.map((friend) => (
                <option key={friend.id} value={friend.id}>{friend.name} ({friend.email})</option>
              ))}
            </select>
            <select name="permissionLevel" defaultValue="2" disabled={!canManage} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60">
              <option value="1">Level 1 - View only</option>
              <option value="2">Level 2 - Edit content</option>
              <option value="3">Level 3 - Manage team</option>
            </select>
            <button type="submit" disabled={!project || !canManage || !friends.length || loading("add-collaborator")} className="w-full rounded-2xl px-4 py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-60" style={{ backgroundColor: accent }}>
              {loading("add-collaborator") ? "Adding..." : "Add friend to project"}
            </button>
            {!canManage ? <p className="text-xs text-slate-400">Only owner and level 3 members can manage the team.</p> : null}
          </form>
        </>
      ) : (
        <div className="rounded-[22px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          Switch this workspace to team mode from Manage Project to add connected friends with permission levels.
        </div>
      )}
    </div>
  );
}

function CharacterPanel({
  project,
  loading,
  onChanged,
  runAction,
  accent,
}: {
  project: ProjectDocument | null;
  loading: (key: string) => boolean;
  onChanged: (project: ProjectDocument) => void;
  runAction: (actionKey: string, action: () => Promise<void>, successMessage?: string) => Promise<void>;
  accent: string;
}) {
  const canEdit = project?.viewerAccess?.canEdit ?? false;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {project?.characters.length ? project.characters.map((character) => (
          <div key={character.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="font-semibold text-slate-800">{character.name}</p>
            <p className="mt-1 text-sm text-slate-500">{character.role}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{character.memory}</p>
          </div>
        )) : (
          <div className="rounded-[22px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No characters yet. Add one below to keep your cast consistent.
          </div>
        )}
      </div>

      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!project || !canEdit) return;
          const form = new FormData(event.currentTarget);
          await runAction("save-character", async () => {
            const updated = await api.createCharacter(project.metadata.id, {
              name: String(form.get("name") || ""),
              role: String(form.get("role") || ""),
              memory: String(form.get("memory") || ""),
            });
            onChanged(updated);
          }, "Character saved");
          event.currentTarget.reset();
        }}
      >
        <input name="name" placeholder="Character name" required disabled={!canEdit} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60" />
        <input name="role" placeholder="Role" required disabled={!canEdit} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60" />
        <textarea name="memory" placeholder="Memory" rows={3} required disabled={!canEdit} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60" />
        <button type="submit" disabled={!project || !canEdit || loading("save-character")} className="w-full rounded-2xl px-4 py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-60" style={{ backgroundColor: accent }}>
          {loading("save-character") ? "Saving..." : "Add character"}
        </button>
      </form>
    </div>
  );
}

function ProjectChatPanel({
  project,
  user,
  messages,
  loading,
  onMessagesChanged,
  runAction,
  accent,
}: {
  project: ProjectDocument | null;
  user: AuthUser;
  messages: ProjectChatMessage[];
  loading: (key: string) => boolean;
  onMessagesChanged: (messages: ProjectChatMessage[]) => void;
  runAction: (actionKey: string, action: () => Promise<void>, successMessage?: string) => Promise<void>;
  accent: string;
}) {
  const fileInputId = "project-chat-file";

  if (!project || project.metadata.mode !== "team") {
    return <div className="rounded-[22px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">Project chat is only available in team workspaces.</div>;
  }

  if (!project.viewerAccess?.canView) {
    return <div className="rounded-[22px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">You do not have access to this team chat.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="max-h-[18rem] space-y-3 overflow-y-auto rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        {messages.length ? messages.map((message) => (
          <div key={message.id} className={`rounded-2xl px-4 py-3 ${message.senderId === user.id ? "bg-blue-50" : "bg-white"}`}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-800">{message.senderName}</p>
              <span className="text-xs text-slate-400">{formatDateTime(message.createdAt)}</span>
            </div>
            {message.content ? <p className="text-sm leading-6 text-slate-700">{message.content}</p> : null}
            {message.fileUrl ? (
              <a href={message.fileUrl} download={message.fileName || true} className="mt-2 inline-flex rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700">
                {message.fileName || "Download file"}
              </a>
            ) : null}
          </div>
        )) : <p className="text-sm text-slate-500">No team messages yet.</p>}
      </div>

      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const file = form.get("file");
          await runAction("project-chat", async () => {
            const result = await api.sendProjectChat(project.metadata.id, {
              content: String(form.get("content") || ""),
              fileName: file instanceof File && file.size ? file.name : undefined,
              fileUrl: file instanceof File && file.size ? await readFileAsDataUrl(file) : undefined,
            });
            onMessagesChanged(result.messages);
          }, "Message sent");
          event.currentTarget.reset();
        }}
      >
        <textarea name="content" rows={4} placeholder="Share updates with the team..." className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
        <div className="flex items-center gap-3">
          <label htmlFor={fileInputId} className="cursor-pointer rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Attach file
          </label>
          <input id={fileInputId} name="file" type="file" className="hidden" />
          <button type="submit" disabled={loading("project-chat")} className="ml-auto rounded-full px-4 py-2 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-60" style={{ backgroundColor: accent }}>
            {loading("project-chat") ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function HistoryPanel({
  project,
  loading,
  onChanged,
  runAction,
  accent,
}: {
  project: ProjectDocument | null;
  loading: (key: string) => boolean;
  onChanged: (project: ProjectDocument) => void;
  runAction: (actionKey: string, action: () => Promise<void>, successMessage?: string) => Promise<void>;
  accent: string;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {project?.branches.map((branch) => (
          <div key={branch.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800">{branch.name}</p>
                <p className="mt-1 text-xs text-slate-500">{branch.description}</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">{branch.status}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {project?.versions.slice(0, 8).map((version) => (
          <div key={version.id} className="rounded-[22px] border border-slate-300 bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{version.label}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(version.createdAt)}</p>
              </div>
              <button type="button" disabled={!project?.viewerAccess?.canManage || loading("restore-version")} onClick={() => void runAction("restore-version", async () => {
                if (!project) return;
                const updated = await api.restoreVersion(project.metadata.id, version.id);
                onChanged(updated);
              }, "Version restored")} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
                Restore
              </button>
            </div>
          </div>
        ))}
        {!project?.versions.length ? (
          <div className="rounded-[22px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">No saved history yet.</div>
        ) : null}
      </div>

      <button type="button" disabled={!project || loading("export")} onClick={() => void runAction("export", async () => {
        if (!project) return;
        const content = await api.exportProject(project.metadata.id);
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${sanitizeFileName(project.metadata.name)}.txt`;
        anchor.click();
        URL.revokeObjectURL(url);
      }, "Project exported")} className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-60">
        {loading("export") ? "Exporting..." : "Export TXT"}
      </button>
    </div>
  );
}

function EditorLoadingOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-white/75 backdrop-blur-sm">
      <div className="flex h-full items-center justify-center">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-700 shadow-sm">
          <div className="mb-2 h-2 w-36 animate-pulse rounded-full bg-blue-200" />
          Gemini is drafting your next chapter...
        </div>
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected image"));
    reader.readAsDataURL(file);
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function stripHtml(value: string) {
  const container = document.createElement("div");
  container.innerHTML = value;
  return (container.textContent || container.innerText || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim() || "project";
}
