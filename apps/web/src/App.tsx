import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

type AuthMode = "login" | "register";
type MainView = "home" | "editor";
type OverlayPanel = "projects" | "friends" | "writer" | "settings" | null;
type ToolPanel = "generate" | "context" | "team" | "character" | "chat" | "history" | "voice";
type SettingsSection = "appearance" | "language" | "security" | "account";

const sidebarItems: Array<{ id: MainView | "projects" | "friends" | "writer" | "settings"; label: string }> = [
  { id: "home", label: "Home" },
  { id: "projects", label: "Projects" },
  { id: "friends", label: "Friends" },
  { id: "writer", label: "Writer" },
  { id: "settings", label: "Settings" },
];

const toolItems: Array<{ id: ToolPanel; label: string; icon: string }> = [
  { id: "generate", label: "Generate", icon: "AI" },
  { id: "context", label: "Context", icon: "C" },
  { id: "team", label: "Team", icon: "T" },
  { id: "character", label: "Character", icon: "CH" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "history", label: "History", icon: "H" },
  { id: "voice", label: "Voice", icon: "V" },
];

const themeOptions = [
  { id: "notion", label: "Notion", shell: "#f7f7f5", sidebar: "#fbfbfa", page: "#ffffff", accent: "#2563eb", soft: "#e7eefc" },
  { id: "mist", label: "Mist", shell: "#eef5fb", sidebar: "#f8fcff", page: "#ffffff", accent: "#0284c7", soft: "#dbeafe" },
  { id: "forest", label: "Forest", shell: "#eff8f0", sidebar: "#f9fcf9", page: "#ffffff", accent: "#0f766e", soft: "#ccfbf1" },
  { id: "cream", label: "Cream", shell: "#faf5ee", sidebar: "#fffdf9", page: "#fffdfa", accent: "#c2410c", soft: "#fed7aa" },
] as const;

const fontOptions = [
  { id: "notion", label: "Notion UI", className: "app-font-notion" },
  { id: "manrope", label: "Manrope", className: "app-font-manrope" },
  { id: "literata", label: "Literata", className: "app-font-literata" },
  { id: "grotesk", label: "Space Grotesk", className: "app-font-grotesk" },
] as const;

const timeZones = ["Asia/Bangkok", "Asia/Ho_Chi_Minh", "UTC", "America/New_York", "Europe/London"];

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
  const [showPreview, setShowPreview] = useState(true);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [showCreateProjectForm, setShowCreateProjectForm] = useState(false);
  const [voiceRate, setVoiceRate] = useState(1);
  const [ttsLanguage, setTtsLanguage] = useState<"vi" | "en">("vi");
  const [ttsPreviewUrl, setTtsPreviewUrl] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const lastLocalEditAtRef = useRef(0);
  const latestSyncPayloadRef = useRef("");
  const lastSelectedChapterRef = useRef<string | undefined>(undefined);

  const selectedTheme = themeOptions.find((item) => item.id === themeId) ?? themeOptions[0];
  const selectedFont = fontOptions.find((item) => item.id === fontId) ?? fontOptions[0];
  const selectedChapter = project?.chapters.find((item) => item.id === selectedChapterId);
  const visibleChapters =
    project?.chapters.filter((chapter) => chapter.branchId === activeBranchId || chapter.branchId === "main") ?? [];
  const markdownPreview = useMemo(() => renderMarkdown(editorContent), [editorContent]);
  const generateCooldownSeconds = Math.max(0, Math.ceil((generateCooldownUntil - Date.now()) / 1000));

  function applySocialOverview(overview: SocialOverview) {
    setDirectoryUsers(overview.users);
    setFriends(overview.friends);
    setIncomingRequests(overview.incomingRequests);
    setOutgoingRequests(overview.outgoingRequests);
  }

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("contextra_theme");
    const storedFont = window.localStorage.getItem("contextra_font");
    const storedPreview = window.localStorage.getItem("contextra_show_preview");
    if (storedTheme && themeOptions.some((item) => item.id === storedTheme)) {
      setThemeId(storedTheme as (typeof themeOptions)[number]["id"]);
    }
    if (storedFont && fontOptions.some((item) => item.id === storedFont)) {
      setFontId(storedFont as (typeof fontOptions)[number]["id"]);
    }
    if (storedPreview) {
      setShowPreview(storedPreview === "true");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("contextra_theme", themeId);
  }, [themeId]);

  useEffect(() => {
    window.localStorage.setItem("contextra_font", fontId);
  }, [fontId]);

  useEffect(() => {
    window.localStorage.setItem("contextra_show_preview", String(showPreview));
  }, [showPreview]);

  useEffect(() => {
    document.documentElement.lang = settings.language;
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
    const nextChapter = nextProject.chapters
      .filter((chapter) => chapter.branchId === branchId || chapter.branchId === "main")
      .at(-1);
    setSelectedChapterId(nextChapter?.id);
    setEditorTitle(nextChapter?.title || "");
    setEditorContent(nextChapter?.content || "");
    latestSyncPayloadRef.current = JSON.stringify({
      id: nextChapter?.id || "",
      title: nextChapter?.title || "",
      content: nextChapter?.content || "",
    });
  }

  function stopSpeechPlayback() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }

    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current);
      activeAudioUrlRef.current = null;
    }

    setTtsPreviewUrl(null);
  }

  async function playWithBrowserSpeech(content: string, language: "vi" | "en") {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return false;
    }

    const speech = window.speechSynthesis;
    speech.cancel();

    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = language === "vi" ? "vi-VN" : "en-US";
    utterance.rate = voiceRate;

    const voices = speech.getVoices();
    const preferredVoice = voices.find((voice) =>
      language === "vi" ? voice.lang.toLowerCase().startsWith("vi") : voice.lang.toLowerCase().startsWith("en"),
    );

    if (language === "vi" && !preferredVoice) {
      return false;
    }

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    return await new Promise<boolean>((resolve) => {
      utterance.onstart = () => {
        setMessage(language === "vi" ? "Dang phat giong doc tieng Viet" : "Playing English voice");
        resolve(true);
      };
      utterance.onerror = () => resolve(false);
      speech.speak(utterance);
    });
  }

  async function speakCurrentDraft() {
    const content = [editorTitle, editorContent].filter(Boolean).join(". ");
    if (!content.trim()) {
      setMessage("Write something before starting voice playback.");
      return;
    }

    stopSpeechPlayback();

    try {
      const blob = await api.synthesizeSpeech({
        text: content,
        language: ttsLanguage,
      });
      const url = URL.createObjectURL(blob);
      setTtsPreviewUrl(url);
      activeAudioUrlRef.current = url;
      requestAnimationFrame(() => {
        const player = audioPlayerRef.current;
        if (!player) {
          setMessage("Audio is ready.");
          return;
        }

        player.playbackRate = voiceRate;
        player.currentTime = 0;
        void player.play()
          .then(() => {
            setMessage(ttsLanguage === "vi" ? "Dang phat giong doc tieng Viet" : "Playing English voice");
          })
          .catch(() => {
            setMessage("Audio is ready below. Press play to start.");
          });
      });
    } catch (error) {
      const fallbackWorked = await playWithBrowserSpeech(content, ttsLanguage);
      if (!fallbackWorked) {
        setMessage(
          ttsLanguage === "vi"
            ? "Khong tim thay giong doc tieng Viet kha dung. Hay kiem tra ket noi AI service."
            : error instanceof Error
              ? error.message
              : "Voice playback failed",
        );
      }
    }
  }

  useEffect(() => () => stopSpeechPlayback(), []);

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
          summary: editorContent.slice(0, 180),
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
    const timer = window.setInterval(() => void syncMessages(), 3000);
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
          projects={projects}
          friends={friends}
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
                project={project}
                selectedChapterId={selectedChapterId}
                visibleChapters={visibleChapters}
                activeBranchId={activeBranchId}
                editorTitle={editorTitle}
                editorContent={editorContent}
                showPreview={showPreview}
                markdownPreview={markdownPreview}
                loadingGenerate={loading("generate")}
                loadingSave={loading("save-chapter")}
                canEdit={project?.viewerAccess?.canEdit ?? true}
                activeUsers={project?.activeUsers ?? []}
                onSelectChapter={setSelectedChapterId}
                onSelectBranch={(branchId) => {
                  setActiveBranchId(branchId);
                  const branchChapter = project?.chapters
                    .filter((chapter) => chapter.branchId === branchId || chapter.branchId === "main")
                    .at(-1);
                  setSelectedChapterId(branchChapter?.id);
                }}
                onTitleChange={(value) => {
                  lastLocalEditAtRef.current = Date.now();
                  setEditorTitle(value);
                }}
                onContentChange={(value) => {
                  lastLocalEditAtRef.current = Date.now();
                  setEditorContent(applySlashCommands(value));
                }}
                onSave={() =>
                  void runAction(
                    "save-chapter",
                    async () => {
                      if (!project || !selectedChapterId) return;
                      const updated = await api.updateChapter(project.metadata.id, selectedChapterId, {
                        title: editorTitle,
                        content: editorContent,
                        summary: editorContent.slice(0, 180),
                      });
                      latestSyncPayloadRef.current = JSON.stringify({
                        id: selectedChapterId,
                        title: editorTitle,
                        content: editorContent,
                      });
                      setProject(updated);
                      await refreshWorkspace(project.metadata.id);
                    },
                    "Chapter saved",
                  )
                }
              />
            )}
          </div>

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

          {toolDrawerOpen ? (
            <ToolDrawer
              project={project}
              user={user}
              activeBranchId={activeBranchId}
              activePanel={toolPanel}
              accent={selectedTheme.accent}
              generateCooldownSeconds={generateCooldownSeconds}
              loading={loading}
              ttsLanguage={ttsLanguage}
              setTtsLanguage={setTtsLanguage}
              voiceRate={voiceRate}
              setVoiceRate={setVoiceRate}
              friends={friends}
              chatMessages={projectChatMessages}
              onSpeak={speakCurrentDraft}
              onStop={stopSpeechPlayback}
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

          {overlayPanel === "projects" ? (
            <ProjectsOverlay
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

          {overlayPanel === "friends" ? (
            <FriendsOverlay
              user={user}
              accent={selectedTheme.accent}
              users={directoryUsers}
              friends={friends}
              incomingRequests={incomingRequests}
              outgoingRequests={outgoingRequests}
              selectedFriendId={selectedFriendId}
              directMessages={directMessages}
              onClose={() => setOverlayPanel(null)}
              onSelectFriend={setSelectedFriendId}
              runAction={runAction}
              onSocialChanged={(overview) => {
                applySocialOverview(overview);
              }}
              onMessagesChanged={setDirectMessages}
            />
          ) : null}

          {overlayPanel === "settings" ? (
            <SettingsOverlay
              user={user}
              settings={settings}
              section={settingsSection}
              setSection={setSettingsSection}
              themeId={themeId}
              setThemeId={setThemeId}
              fontId={fontId}
              setFontId={setFontId}
              showPreview={showPreview}
              setShowPreview={setShowPreview}
              onClose={() => setOverlayPanel(null)}
              onLogout={() => {
                stopSpeechPlayback();
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

          {overlayPanel === "writer" ? (
            <WriterOverlay project={project} accent={selectedTheme.accent} onClose={() => setOverlayPanel(null)} />
          ) : null}
        </main>
      </div>

      <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900/92 px-5 py-2 text-sm text-white shadow-lg">
        {loadingAction ? "Working..." : message}
      </div>

      {ttsPreviewUrl ? (
        <div className="fixed bottom-5 right-24 z-40 w-[22rem] rounded-[24px] border border-slate-200 bg-white/96 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.16)] backdrop-blur-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Voice playback</p>
          <audio
            ref={audioPlayerRef}
            controls
            src={ttsPreviewUrl}
            className="w-full"
            onEnded={() => setMessage("Voice playback finished")}
            onError={() => setMessage("Voice playback failed")}
          />
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceSidebar({
  projects,
  friends,
  selectedProjectId,
  activeMainView,
  accent,
  onOpenHome,
  onOpenPanel,
  onSelectProject,
  onCreateProjectShortcut,
}: {
  projects: ProjectSummary[];
  friends: AuthUser[];
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
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">C</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">Contextra workspace</p>
          <p className="text-xs text-slate-400">AI writing space</p>
        </div>
      </div>

      <div className="rounded-xl bg-white px-3 py-2.5 text-sm text-slate-400 shadow-sm">Search</div>

      <div className="mt-4 space-y-1">
        {sidebarItems.map((item) => {
          const isActive = item.id === "home" ? activeMainView === "home" : false;
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
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] font-medium transition ${
                isActive ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white"
              }`}
            >
              <span>{item.label}</span>
              {item.id === "projects" ? <span className="text-xs text-slate-400">{projects.length}</span> : null}
              {item.id === "friends" ? <span className="text-xs text-slate-400">{friends.length}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between px-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Projects</p>
        <button type="button" onClick={onCreateProjectShortcut} className="rounded-full px-2 py-1 text-xs font-medium text-white" style={{ backgroundColor: accent }}>
          New
        </button>
      </div>

      <div className="mt-3 space-y-1 overflow-y-auto">
        {projects.slice(0, 8).map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelectProject(project.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
              selectedProjectId === project.id ? "bg-white shadow-sm" : "hover:bg-white"
            }`}
          >
            <span className="text-lg text-slate-400">D</span>
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
  user,
  recentProjects,
  publicProjects,
  onOpenProject,
  onCreateProject,
}: {
  user: AuthUser;
  recentProjects: HomeOverview["recentProjects"];
  publicProjects: PublicProjectSummary[];
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-10 pt-6">
        <p className="text-sm text-slate-400">Workspace overview</p>
        <h1 className="mt-3 text-[3rem] font-semibold tracking-[-0.05em] text-slate-900">Good morning, {user.name.split(" ")[0]}</h1>
      </div>

      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-500">Recently visited</p>
          <button type="button" onClick={onCreateProject} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            Create project
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {recentProjects.map((project) => (
            <button key={project.id} type="button" onClick={() => onOpenProject(project.id)} className="rounded-[26px] border border-slate-200 bg-white p-5 text-left shadow-[0_12px_40px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5">
              <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">D</div>
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
              <p className="mt-3 text-sm leading-6">Create your first workspace and start writing with context-aware AI.</p>
            </button>
          ) : null}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-500">Public projects</p>
          <p className="text-sm text-slate-400">Projects shared by other writers</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          {publicProjects.map((project) => (
            <button key={project.id} type="button" onClick={() => onOpenProject(project.id)} className="rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
              <div className="mb-6 h-28 rounded-[20px] bg-gradient-to-br from-slate-100 to-white" />
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
  project,
  selectedChapterId,
  visibleChapters,
  activeBranchId,
  editorTitle,
  editorContent,
  showPreview,
  markdownPreview,
  loadingGenerate,
  loadingSave,
  canEdit,
  activeUsers,
  onSelectChapter,
  onSelectBranch,
  onTitleChange,
  onContentChange,
  onSave,
}: {
  project: ProjectDocument | null;
  selectedChapterId?: string;
  visibleChapters: ProjectDocument["chapters"];
  activeBranchId: string;
  editorTitle: string;
  editorContent: string;
  showPreview: boolean;
  markdownPreview: ReactNode;
  loadingGenerate: boolean;
  loadingSave: boolean;
  canEdit: boolean;
  activeUsers: ProjectPresence[];
  onSelectChapter: (chapterId: string) => void;
  onSelectBranch: (branchId: string) => void;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSave: () => void;
}) {
  if (!project) {
    return <div className="flex h-full items-center justify-center text-slate-500">Select a project to start writing.</div>;
  }

  return (
    <div className="w-full pb-6 pt-2">
      <section className="min-w-0">
        <div className="rounded-[30px] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)] lg:px-5">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">{project.metadata.name}</p>
              <p className="text-sm text-slate-400">{project.metadata.isPublic ? "Public project" : "Private project"}</p>
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
              <button type="button" onClick={onSave} disabled={!canEdit || loadingSave || !selectedChapterId} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {loadingSave ? "Saving..." : canEdit ? "Save" : "Read only"}
              </button>
            </div>
          </div>

          {!canEdit ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              This public or low-permission project is view only. Editing is disabled for your account.
            </div>
          ) : null}

          <input
            value={editorTitle}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Untitled chapter"
            disabled={!canEdit}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="mb-6 w-full border-none bg-transparent px-0 text-[2.3rem] font-semibold tracking-[-0.05em] text-slate-900 outline-none placeholder:text-slate-300 disabled:cursor-not-allowed disabled:opacity-70"
          />

          <div className={`grid gap-5 ${showPreview ? "xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.3fr)_minmax(320px,0.9fr)]" : "xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.3fr)]"}`}>
            <div className="relative min-w-0">
              <textarea
                value={editorContent}
                onChange={(event) => onContentChange(event.target.value)}
                placeholder="Write your draft here. Slash commands like /h1 and /quote still work, but the helper chips are hidden."
                disabled={!canEdit}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className="h-[72vh] w-full resize-none rounded-[28px] border border-slate-200 bg-[#fbfbfa] px-6 py-6 text-[1rem] leading-8 text-slate-700 outline-none focus:bg-white disabled:cursor-not-allowed disabled:opacity-70"
              />
              {loadingGenerate ? <EditorLoadingOverlay /> : null}
            </div>

            <aside className="min-w-0 rounded-[28px] border border-slate-200 bg-[#fbfbfa] p-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">Chapters</p>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-400">{visibleChapters.length}</span>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                {project.branches.map((branch) => (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => onSelectBranch(branch.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${activeBranchId === branch.id ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
              <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "62vh" }}>
                {visibleChapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => onSelectChapter(chapter.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left text-sm ${selectedChapterId === chapter.id ? "border-slate-900 bg-white text-slate-900" : "border-transparent bg-white/80 text-slate-500 hover:bg-white"}`}
                  >
                    <p className="truncate font-medium">{chapter.title}</p>
                    <p className="mt-1 text-xs text-slate-400">Chapter {chapter.index}</p>
                  </button>
                ))}
              </div>
            </aside>

            {showPreview ? (
              <div className="h-[72vh] overflow-y-auto rounded-[28px] border border-slate-200 bg-white px-6 py-6">
                <div className="editor-markdown">{markdownPreview}</div>
              </div>
            ) : null}
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
          <button type="button" onClick={onToggleCreateForm} disabled={!canManage} className="mb-4 w-full rounded-2xl px-4 py-3 text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: accent }}>
            {showCreateProjectForm ? "Hide create form" : "New project"}
          </button>
          <div className="space-y-1">
            {projects.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectProject(item.id)}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm ${selectedProjectId === item.id ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:bg-white"}`}
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
            <div className="rounded-[24px] border border-dashed border-slate-300 p-6 text-sm text-slate-500">Select a project or create a new one.</div>
          )}
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700">Visibility</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">Publish a project so other users can discover it in the Home overview.</p>
          <div className="mt-5 flex gap-3">
            <button type="button" disabled={!project || !canManage || loadingVisibility} onClick={() => onTogglePublic(false)} className="flex-1 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-60">
              Private
            </button>
            <button type="button" disabled={!project || !canManage || loadingVisibility} onClick={() => onTogglePublic(true)} className="flex-1 rounded-2xl px-4 py-3 text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: accent }}>
              Public
            </button>
          </div>
          {project ? <p className="mt-3 text-xs text-slate-400">Current: {project.metadata.isPublic ? "Public" : "Private"}{!canManage ? " • You can view but not manage this project." : ""}</p> : null}
        </div>
      </div>
    </OverlayShell>
  );
}

function SettingsOverlay({
  user,
  settings,
  section,
  setSection,
  themeId,
  setThemeId,
  fontId,
  setFontId,
  showPreview,
  setShowPreview,
  onClose,
  onLogout,
  onUpdateAccount,
  onSaveSettings,
}: {
  user: AuthUser;
  settings: UserSettings;
  section: SettingsSection;
  setSection: (section: SettingsSection) => void;
  themeId: (typeof themeOptions)[number]["id"];
  setThemeId: (themeId: (typeof themeOptions)[number]["id"]) => void;
  fontId: (typeof fontOptions)[number]["id"];
  setFontId: (fontId: (typeof fontOptions)[number]["id"]) => void;
  showPreview: boolean;
  setShowPreview: (value: boolean) => void;
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
            { id: "appearance", label: "Appearance" },
            { id: "language", label: "Language & Time" },
            { id: "security", label: "Security" },
            { id: "account", label: "Account" },
          ].map((item) => (
            <button key={item.id} type="button" onClick={() => setSection(item.id as SettingsSection)} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm ${section === item.id ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:bg-white"}`}>
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      {section === "appearance" ? (
        <div className="space-y-8">
          <PreferenceSection title="Theme">
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
          <PreferenceSection title="Font">
            <div className="grid gap-3 md:grid-cols-2">
              {fontOptions.map((option) => (
                <button key={option.id} type="button" onClick={() => setFontId(option.id)} className={`rounded-[22px] border px-4 py-4 text-left ${option.className}`} style={{ borderColor: fontId === option.id ? "#111827" : "#e2e8f0", backgroundColor: fontId === option.id ? "#f8fafc" : "#ffffff" }}>
                  <p className="font-semibold">{option.label}</p>
                </button>
              ))}
            </div>
          </PreferenceSection>
          <PreferenceSection title="Editor">
            <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span>Show markdown preview</span>
              <input type="checkbox" checked={showPreview} onChange={(event) => setShowPreview(event.target.checked)} />
            </label>
          </PreferenceSection>
        </div>
      ) : null}

      {section === "language" ? (
        <div className="space-y-8">
          <PreferenceSection title="Language">
            <div className="grid gap-3 md:grid-cols-2">
              <button type="button" onClick={() => setDraftSettings((current) => ({ ...current, language: "en-US" }))} className={`rounded-2xl border px-4 py-3 text-left text-sm ${draftSettings.language === "en-US" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>English (US)</button>
              <button type="button" onClick={() => setDraftSettings((current) => ({ ...current, language: "vi-VN" }))} className={`rounded-2xl border px-4 py-3 text-left text-sm ${draftSettings.language === "vi-VN" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>Tiếng Việt</button>
            </div>
          </PreferenceSection>
          <PreferenceSection title="Time zone">
            <select value={draftSettings.timeZone} onChange={(event) => setDraftSettings((current) => ({ ...current, timeZone: event.target.value }))} className="w-full max-w-sm rounded-2xl border border-slate-300 px-4 py-3">
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </PreferenceSection>
          <button type="button" onClick={() => void onSaveSettings(draftSettings)} className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white">
            Save language & time
          </button>
        </div>
      ) : null}

      {section === "security" ? (
        <div className="space-y-8">
          <PreferenceSection title="Security mode">
            <div className="grid gap-3 md:grid-cols-2">
              <button type="button" onClick={() => setDraftSettings((current) => ({ ...current, securityMode: "standard" }))} className={`rounded-2xl border px-4 py-4 text-left ${draftSettings.securityMode === "standard" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                <p className="font-semibold text-slate-800">Standard</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Balanced access for daily writing and collaboration.</p>
              </button>
              <button type="button" onClick={() => setDraftSettings((current) => ({ ...current, securityMode: "strict" }))} className={`rounded-2xl border px-4 py-4 text-left ${draftSettings.securityMode === "strict" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                <p className="font-semibold text-slate-800">Strict</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Favor private workspaces and tighter collaboration access.</p>
              </button>
            </div>
          </PreferenceSection>
          <button type="button" onClick={() => void onSaveSettings(draftSettings)} className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white">
            Save security
          </button>
        </div>
      ) : null}

      {section === "account" ? (
        <div className="space-y-6">
          <PreferenceSection title="Account">
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
                <input value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
                <input value={user.email} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500" />
                <input value={accountForm.dateOfBirth} onChange={(event) => setAccountForm((current) => ({ ...current, dateOfBirth: event.target.value }))} type="date" className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
                <label className="block rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  <span className="mb-3 block font-medium text-slate-700">Profile image</span>
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
                <input value={accountForm.currentPassword} onChange={(event) => setAccountForm((current) => ({ ...current, currentPassword: event.target.value }))} type="password" placeholder="Current password" className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
                <input value={accountForm.newPassword} onChange={(event) => setAccountForm((current) => ({ ...current, newPassword: event.target.value }))} type="password" placeholder="New password" className="w-full rounded-2xl border border-slate-300 px-4 py-3" />
                <button
                  type="button"
                  onClick={async () => {
                    await onUpdateAccount({
                      name: accountForm.name,
                      dateOfBirth: accountForm.dateOfBirth,
                      profileImageUrl: accountForm.profileImageUrl,
                      currentPassword: accountForm.currentPassword,
                      newPassword: accountForm.newPassword,
                    });
                    setAccountForm((current) => ({ ...current, currentPassword: "", newPassword: "" }));
                  }}
                  className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
                >
                  Save account
                </button>
                <button type="button" onClick={onLogout} className="rounded-full border border-rose-200 px-5 py-2.5 text-sm font-medium text-rose-600">
                  Logout
                </button>
              </div>
            </div>
          </PreferenceSection>
        </div>
      ) : null}
    </OverlayShell>
  );
}

function FriendsOverlay({
  user,
  accent,
  users,
  friends,
  incomingRequests,
  outgoingRequests,
  selectedFriendId,
  directMessages,
  onClose,
  onSelectFriend,
  runAction,
  onSocialChanged,
  onMessagesChanged,
}: {
  user: AuthUser;
  accent: string;
  users: UserDirectoryItem[];
  friends: AuthUser[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  selectedFriendId?: string;
  directMessages: DirectMessage[];
  onClose: () => void;
  onSelectFriend: (friendId: string | undefined) => void;
  runAction: (actionKey: string, action: () => Promise<void>, successMessage?: string) => Promise<void>;
  onSocialChanged: (overview: SocialOverview) => void;
  onMessagesChanged: (messages: DirectMessage[]) => void;
}) {
  const selectedFriend = friends.find((friend) => friend.id === selectedFriendId);
  const currentFriend = selectedFriend ?? friends[0];
  const fileInputId = "friend-chat-file";

  useEffect(() => {
    if (!selectedFriendId && friends[0]) {
      onSelectFriend(friends[0].id);
    }
  }, [friends, onSelectFriend, selectedFriendId]);

  return (
    <OverlayShell
      title="Friends"
      onClose={onClose}
      sidebar={
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Requests</p>
            <div className="space-y-2">
              <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">Incoming: {incomingRequests.filter((item) => item.status === "pending").length}</div>
              <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">Outgoing: {outgoingRequests.filter((item) => item.status === "pending").length}</div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Friends</p>
              <div className="space-y-1">
                {friends.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => onSelectFriend(friend.id)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left text-sm ${currentFriend?.id === friend.id ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:bg-white"}`}
                  >
                  <p className="truncate font-medium">{friend.name}</p>
                  <p className="truncate text-xs text-slate-400">{friend.email}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-8">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">Discover people</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{users.length} users</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {users.map((person) => {
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
                        <button type="button" onClick={() => onSelectFriend(person.id)} className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                          Open chat
                        </button>
                      ) : hasIncomingRequest ? (
                        <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">Waiting for your reply</span>
                      ) : hasOutgoingRequest ? (
                        <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">Request sent</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void runAction("friend-request", async () => {
                            const next = await api.sendFriendRequest(person.id);
                            onSocialChanged(next);
                          }, "Friend request sent")}
                          className="rounded-full px-3 py-2 text-xs font-medium text-white"
                          style={{ backgroundColor: accent }}
                        >
                          Send request
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-xl font-semibold text-slate-900">Incoming requests</h3>
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
                      }, "Friend request accepted")} className="rounded-full px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: accent }}>
                        Accept
                      </button>
                      <button type="button" onClick={() => void runAction("reject-friend", async () => {
                        const next = await api.respondToFriendRequest(request.id, "rejected");
                        onSocialChanged(next);
                      }, "Friend request rejected")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{request.status}</span>
                  )}
                </div>
              )) : (
                <div className="rounded-[24px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">No incoming requests right now.</div>
              )}
            </div>
          </section>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-[#fbfbfa] p-5">
          <div className="mb-4">
            <p className="text-sm text-slate-400">Private messages</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">{currentFriend?.name || "Choose a friend"}</h3>
          </div>
          <div className="mb-4 max-h-[22rem] space-y-3 overflow-y-auto">
            {currentFriend ? directMessages.map((message) => (
              <div key={message.id} className={`rounded-2xl px-4 py-3 ${message.senderId === user.id ? "bg-blue-50" : "bg-white"}`}>
                <p className="text-xs text-slate-400">{formatDateTime(message.createdAt)}</p>
                {message.content ? <p className="mt-1 text-sm leading-6 text-slate-700">{message.content}</p> : null}
                {message.fileUrl ? (
                  <a href={message.fileUrl} download={message.fileName || true} className="mt-2 inline-flex rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700">
                    {message.fileName || "Download file"}
                  </a>
                ) : null}
              </div>
            )) : (
              <div className="rounded-[24px] border border-dashed border-slate-300 p-4 text-sm text-slate-500">Select a friend to start chatting.</div>
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
                    content: String(form.get("content") || ""),
                    fileName: file instanceof File && file.size ? file.name : undefined,
                    fileUrl: file instanceof File && file.size ? await readFileAsDataUrl(file) : undefined,
                  });
                  onMessagesChanged(result.messages);
                }, "Message sent");
                event.currentTarget.reset();
              }}
            >
              <textarea name="content" rows={4} placeholder="Write a private message..." className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" />
              <div className="flex items-center gap-3">
                <label htmlFor={fileInputId} className="cursor-pointer rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Send file
                </label>
                <input id={fileInputId} name="file" type="file" className="hidden" />
                <button type="submit" className="ml-auto rounded-full px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: accent }}>
                  Send
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </OverlayShell>
  );
}

function WriterOverlay({
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
      title="Writer"
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
        <div className="rounded-[24px] border border-dashed border-slate-300 p-6 text-sm text-slate-500">Select a project before opening the writer panel.</div>
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
          className="group flex h-14 w-14 items-center justify-center rounded-full border border-white/60 bg-white text-sm font-semibold text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5"
          style={drawerOpen && activePanel === item.id ? { backgroundColor: accent, color: "#ffffff" } : undefined}
          title={item.label}
        >
          {item.icon}
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
  ttsLanguage,
  setTtsLanguage,
  voiceRate,
  setVoiceRate,
  friends,
  chatMessages,
  onSpeak,
  onStop,
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
  ttsLanguage: "vi" | "en";
  setTtsLanguage: (value: "vi" | "en") => void;
  voiceRate: number;
  setVoiceRate: (value: number) => void;
  friends: AuthUser[];
  chatMessages: ProjectChatMessage[];
  onSpeak: () => void;
  onStop: () => void;
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

        {activePanel === "team" ? <TeamPanel project={project} friends={friends} loading={loading} onChanged={onChanged} runAction={runAction} accent={accent} /> : null}
        {activePanel === "character" ? <CharacterPanel project={project} loading={loading} onChanged={onChanged} runAction={runAction} accent={accent} /> : null}
        {activePanel === "chat" ? <ProjectChatPanel project={project} user={user} loading={loading} runAction={runAction} messages={chatMessages} onMessagesChanged={onChatChanged} accent={accent} /> : null}
        {activePanel === "history" ? <HistoryPanel project={project} loading={loading} onChanged={onChanged} runAction={runAction} accent={accent} /> : null}

        {activePanel === "voice" ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-500">Contextra now uses server-side text to speech, with guaranteed Vietnamese and English playback.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <button type="button" onClick={() => setTtsLanguage("vi")} className={`rounded-2xl border px-4 py-3 text-left text-sm ${ttsLanguage === "vi" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                Tieng Viet
              </button>
              <button type="button" onClick={() => setTtsLanguage("en")} className={`rounded-2xl border px-4 py-3 text-left text-sm ${ttsLanguage === "en" ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                English
              </button>
            </div>
            <label className="block rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <div className="mb-2 flex items-center justify-between"><span>Rate</span><span>{voiceRate.toFixed(1)}</span></div>
              <input type="range" min="0.7" max="1.4" step="0.1" value={voiceRate} onChange={(event) => setVoiceRate(Number(event.target.value))} className="w-full" />
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={onSpeak} className="flex-1 rounded-2xl px-4 py-3 text-sm font-medium text-white" style={{ backgroundColor: accent }}>
                Play
              </button>
              <button type="button" onClick={onStop} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700">
                Stop
              </button>
            </div>
          </div>
        ) : null}
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
          Switch this workspace to a team project when creating it to add connected friends with permission levels.
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
              goals: String(form.get("goals") || ""),
              traits: String(form.get("traits") || "").split(",").map((value) => value.trim()).filter(Boolean),
              memory: String(form.get("memory") || ""),
            });
            onChanged(updated);
          }, "Character saved");
          event.currentTarget.reset();
        }}
      >
        <input name="name" placeholder="Character name" required disabled={!canEdit} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60" />
        <input name="role" placeholder="Role" required disabled={!canEdit} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60" />
        <textarea name="goals" placeholder="Goals" rows={2} required disabled={!canEdit} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60" />
        <input name="traits" placeholder="Traits, comma separated" disabled={!canEdit} className="w-full rounded-2xl border border-slate-300 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60" />
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
              {branch.id !== "main" && branch.status !== "merged" ? (
                <button type="button" disabled={!project?.viewerAccess?.canManage || loading("merge-branch")} onClick={() => void runAction("merge-branch", async () => {
                  if (!project) return;
                  const updated = await api.mergeBranch(project.metadata.id, branch.id);
                  onChanged(updated);
                }, "Branch merged")} className="rounded-full px-4 py-2 text-xs font-medium text-white transition hover:opacity-95 disabled:opacity-60" style={{ backgroundColor: accent }}>
                  Merge
                </button>
              ) : (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">{branch.status}</span>
              )}
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

function applySlashCommands(value: string) {
  return value
    .replace(/(^|\n)\/h1\s+/g, "$1# ")
    .replace(/(^|\n)\/h2\s+/g, "$1## ")
    .replace(/(^|\n)\/h3\s+/g, "$1### ")
    .replace(/(^|\n)\/bullet\s+/g, "$1- ")
    .replace(/(^|\n)\/quote\s+/g, "$1> ")
    .replace(/(^|\n)\/todo\s+/g, "$1- [ ] ")
    .replace(/(^|\n)\/code\s+/g, "$1```text\n");
}

function renderMarkdown(value: string) {
  const lines = value.split("\n");
  const nodes: ReactNode[] = [];
  let listBuffer: string[] = [];
  let codeBuffer: string[] = [];
  let inCodeBlock = false;

  const flushList = () => {
    if (!listBuffer.length) return;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="mb-4 list-disc space-y-2 pl-6 text-slate-700">
        {listBuffer.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  const flushCode = () => {
    if (!codeBuffer.length) return;
    nodes.push(
      <pre key={`code-${nodes.length}`} className="mb-4 overflow-x-auto rounded-2xl bg-slate-900 px-4 py-4 text-sm text-slate-100">
        <code>{codeBuffer.join("\n")}</code>
      </pre>,
    );
    codeBuffer = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    if (line.startsWith("```")) {
      if (inCodeBlock) flushCode();
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      return;
    }
    if (line.startsWith("- ")) {
      listBuffer.push(line.slice(2));
      return;
    }

    flushList();

    if (!line.trim()) {
      nodes.push(<div key={`space-${index}`} className="h-4" />);
      return;
    }
    if (line.startsWith("# ")) {
      nodes.push(<h1 key={`h1-${index}`} className="mb-4 text-4xl font-semibold tracking-[-0.04em] text-slate-900">{line.slice(2)}</h1>);
      return;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h2 key={`h2-${index}`} className="mb-4 mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-800">{line.slice(3)}</h2>);
      return;
    }
    if (line.startsWith("### ")) {
      nodes.push(<h3 key={`h3-${index}`} className="mb-3 mt-2 text-xl font-semibold text-slate-800">{line.slice(4)}</h3>);
      return;
    }
    if (line.startsWith("> ")) {
      nodes.push(<blockquote key={`quote-${index}`} className="mb-4 rounded-r-2xl border-l-4 border-slate-300 bg-slate-50 px-4 py-3 text-slate-600">{renderInline(line.slice(2))}</blockquote>);
      return;
    }
    nodes.push(<p key={`p-${index}`} className="mb-4 leading-8 text-slate-700">{renderInline(line)}</p>);
  });

  flushList();
  flushCode();

  if (!nodes.length) {
    return <p className="text-sm leading-7 text-slate-400">Markdown preview will appear here as you write.</p>;
  }

  return nodes;
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`} className="rounded-lg bg-slate-100 px-2 py-1 text-[0.92em] text-slate-800">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function sanitizeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim() || "project";
}
