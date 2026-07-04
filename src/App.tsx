import React, { useState, useEffect, useRef } from "react";
import { 
  Github, 
  Upload, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Lock, 
  Settings2, 
  RefreshCw, 
  Terminal, 
  Info, 
  ExternalLink, 
  FileCheck, 
  Eye, 
  EyeOff, 
  Save,
  Check,
  AlertCircle,
  HelpCircle,
  Globe,
  Printer,
  Download,
  UploadCloud,
  FileJson,
  ShieldCheck,
  Smartphone
} from "lucide-react";
import { DeployConfig, LogEntry, LogType, UploadResponse } from "./types";

export default function App() {
  // Localization: Arabic (Default) and English
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const isAr = lang === "ar";

  // Configuration State
  const [config, setConfig] = useState<DeployConfig>({
    appName: "متجر أم روح",
    pat: "",
    owner: "",
    repo: "",
    branch: "main",
    message: "Update application files via ZIP Deployer",
    subfolder: "",
    cleanSync: false,
    pwaSafeguard: true
  });

  // UI state
  const [showToken, setShowToken] = useState(false);
  const [saveConfig, setSaveConfig] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [connectionError, setConnectionError] = useState("");
  const [isRepoEmptyState, setIsRepoEmptyState] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  
  // PWA states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  
  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Deployment process state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<"all" | "info" | "progress" | "warn" | "error">("all");
  const [deployStats, setDeployStats] = useState({
    totalChecked: 0,
    uploaded: 0,
    skipped: 0,
    deleted: 0,
    failed: 0
  });

  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupImportRef = useRef<HTMLInputElement>(null);

  // Load configuration from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem("github_deploy_config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error("Failed to parse saved config", e);
      }
    }
  }, []);

  // Save configuration to local storage when config changes
  useEffect(() => {
    if (saveConfig) {
      localStorage.setItem("github_deploy_config", JSON.stringify(config));
    } else {
      localStorage.removeItem("github_deploy_config");
    }
  }, [config, saveConfig]);

  // Auto scroll logs console to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // PWA setup and installation prompt listener
  useEffect(() => {
    // 1. Register Service Worker
    if ("serviceWorker" in navigator) {
      const registerSW = async () => {
        try {
          const registration = await navigator.serviceWorker.register("/sw.js");
          console.log("ServiceWorker registration successful with scope: ", registration.scope);
        } catch (error) {
          console.warn("ServiceWorker registration failed: ", error);
        }
      };
      
      if (document.readyState === "complete") {
        registerSW();
      } else {
        window.addEventListener("load", registerSW);
        return () => window.removeEventListener("load", registerSW);
      }
    }
  }, []);

  useEffect(() => {
    // 2. Capture beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 3. Detect if already running in standalone (installed) mode
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || 
                        (navigator as any).standalone === true;
    if (isStandalone) {
      setShowInstallBanner(false);
    }

    // 4. Capture appinstalled event
    const handleAppInstalled = () => {
      console.log("PWA was installed successfully");
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // Fallback: If no prompt event is captured, give instructions
      alert(
        isAr 
          ? "يمكنك تثبيت هذا التطبيق مباشرة من خيارات المتصفح (اضغط على النقاط الثلاثة ثم اختر تثبيت أو 'إضافة إلى الشاشة الرئيسية')."
          : "To install this app, tap your browser's menu (three dots) and select 'Install' or 'Add to Home Screen'."
      );
      return;
    }
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to install prompt: ${outcome}`);
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setShowInstallBanner(false);
      }
    } catch (err) {
      console.error("Installation prompt failed", err);
    }
  };

  // Toggle Language Helper
  const toggleLanguage = () => {
    setLang(prev => (prev === "en" ? "ar" : "en"));
  };

  // Test Github Connection API Call
  const testConnection = async () => {
    if (!config.pat || !config.owner || !config.repo) {
      setConnectionStatus("error");
      setConnectionError(isAr ? "يرجى تعبئة الحقول الأساسية أولاً: التوكن، المالك، المستودع" : "Please fill in basic inputs first: PAT, Owner, Repository");
      return;
    }

    setConnectionStatus("testing");
    setConnectionError("");
    setIsRepoEmptyState(false);

    try {
      const headers: Record<string, string> = {
        "Authorization": `token ${config.pat}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Zip-to-Github-PWA-Deployment-Utility"
      };

      // 1. Fetch Repository Metadata to verify token validity, repository existence, and permission scopes
      const repoUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;
      const repoResponse = await fetch(repoUrl, { headers });

      if (repoResponse.ok) {
        const repoData = await repoResponse.json();
        
        // Check if the authenticated token has Write/Push access to this repository
        const hasPushAccess = repoData.permissions?.push === true;

        if (!hasPushAccess) {
          setConnectionStatus("error");
          setConnectionError(JSON.stringify({
            status: 200,
            hasPushAccess: false,
            type: "repo",
            githubMessage: "Access level: Read-Only (Pull: true, Push: false)",
            message: isAr 
              ? "تحذير: رمز الـ Token صالح ومصرح، ولكن ليس لديك صلاحية الكتابة والتعديل (Push) على هذا المستودع. تأكد من منح صلاحية (Contents: Read and Write) للرمز في إعدادات GitHub."
              : "Connected successfully, but your token lacks Write (Push) permissions for this repository. Ensure you enabled 'Contents: Read and Write' scope for this Fine-grained token."
          }));
          return;
        }

        // 2. Fetch active branch reference to verify branch name and ensure repository is initialized
        const branchUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/git/ref/heads/${config.branch}`;
        const branchResponse = await fetch(branchUrl, { headers });

        if (branchResponse.ok) {
          setIsRepoEmptyState(false);
          setConnectionStatus("success");
        } else {
          // If branch does not exist, check if repository has no branches at all (empty repository)
          const branchesUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/branches`;
          const branchesResponse = await fetch(branchesUrl, { headers });
          let isRepoEmpty = false;
          
          if (branchesResponse.ok) {
            const branchesData = await branchesResponse.json();
            if (Array.isArray(branchesData) && branchesData.length === 0) {
              isRepoEmpty = true;
            }
          }

          if (isRepoEmpty) {
            setIsRepoEmptyState(true);
            setConnectionStatus("success");
          } else {
            setIsRepoEmptyState(false);
            const branchStatus = branchResponse.status;
            let branchErrorText = "";
            try {
              const text = await branchResponse.text();
              try {
                const parsed = JSON.parse(text);
                branchErrorText = parsed.message || text;
              } catch {
                branchErrorText = text;
              }
            } catch {
              branchErrorText = branchResponse.statusText;
            }

            setConnectionStatus("error");
            setConnectionError(JSON.stringify({
              status: branchStatus,
              type: "branch",
              branch: config.branch,
              githubMessage: branchErrorText,
              message: isAr
                ? `تم العثور على المستودع بنجاح، ولكن تعذر الوصول إلى الفرع المنشود "${config.branch}". يرجى التأكد من كتابة اسم الفرع بشكل صحيح، أو تأكد من أن المستودع غير فارغ ويحتوي على الأقل على ملف واحد (مثل README.md) لإنشاء الفرع الافتراضي.`
                : `Found repository but failed to access branch "${config.branch}". Make sure the branch name is correct, and that the repository is not empty (it must have at least one commit/file like README.md to initialize the default branch).`
            }));
          }
        }
      } else {
        // Repository fetch failed
        const httpStatus = repoResponse.status;
        let errorDetails = "";
        let responseBody: any = null;

        try {
          const text = await repoResponse.text();
          try {
            responseBody = JSON.parse(text);
          } catch {
            errorDetails = text;
          }
        } catch {
          errorDetails = "Failed to parse error response body";
        }

        const githubMessage = responseBody?.message || errorDetails || repoResponse.statusText;
        const documentationUrl = responseBody?.documentation_url || "";
        
        let customMessage = "";
        if (httpStatus === 401) {
          customMessage = isAr 
            ? "رمز الوصول الشخصي (Token) غير صالح أو منتهي الصلاحية أو تم حذفه. يرجى التحقق من القيمة المدخلة وإعادة المحاولة."
            : "The Personal Access Token (PAT) is invalid, expired, or has been revoked. Please check the token value and try again.";
        } else if (httpStatus === 403) {
          customMessage = isAr
            ? "الوصول غير مسموح (Forbidden). قد يكون السبب تجاوز الحد الأقصى لمعدل الطلبات المسموح به (Rate Limit)، أو عدم كفاية الصلاحيات للوصول للمستودع المحدد."
            : "Access Forbidden (403). This could be due to rate limiting or insufficient permission scopes (e.g., token lacks access to this organization or repository).";
        } else if (httpStatus === 404) {
          customMessage = isAr
            ? "لم يتم العثور على المستودع (Not Found). يرجى التأكد من صحة اسم الحساب والمالك واسم المستودع، وتأكد من أن الرمز مصرح له للوصول لهذا المستودع (خاصة إذا كان خاصاً Private)."
            : "Repository Not Found (404). Please verify the Owner and Repository names. If this is a private repository, ensure your token has been granted explicit permissions to access private repos.";
        } else {
          customMessage = isAr
            ? `حدث خطأ غير متوقع أثناء الاتصال بـ GitHub API (رمز الحالة: ${httpStatus}).`
            : `Unrecognized GitHub API error response (Status code: ${httpStatus}).`;
        }

        setConnectionStatus("error");
        setConnectionError(JSON.stringify({
          status: httpStatus,
          type: "repo",
          githubMessage,
          documentationUrl,
          message: customMessage
        }));
      }
    } catch (err: any) {
      setConnectionStatus("error");
      setConnectionError(JSON.stringify({
        status: 0,
        type: "other",
        githubMessage: err.message || "Network error",
        message: isAr 
          ? "فشل في إرسال طلب الشبكة. يرجى التحقق من اتصال الإنترنت وخلو العنوان من أي مشاكل."
          : "Failed to perform network request. Please verify your internet connection and GitHub API accessibility."
      }));
    }
  };

  // Drag and Drop files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const selectedFile = files[0];
      if (selectedFile.name.endsWith(".zip")) {
        setFile(selectedFile);
        setUploadError("");
        setUploadedFileId(null);
      } else {
        setUploadError(isAr ? "يرجى سحب ملف بصيغة ZIP فقط" : "Please drop a ZIP file only");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setFile(files[0]);
      setUploadError("");
      setUploadedFileId(null);
    }
  };

  // Upload ZIP file to node backend
  const uploadZipFile = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadError("");
    setUploadProgress(10);

    const formData = new FormData();
    formData.append("zipFile", file);

    try {
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev === null) return 10;
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 15;
        });
      }, 100);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      clearInterval(interval);

      if (!response.ok) {
        throw new Error(isAr ? "فشل رفع الملف إلى السيرفر" : "Failed to upload file to local server");
      }

      const data: UploadResponse = await response.json();
      setUploadedFileId(data.fileId);
      setUploadProgress(100);
      setTimeout(() => setUploadProgress(null), 1000);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
      setUploadProgress(null);
    } finally {
      setIsUploading(false);
    }
  };

  // Start deployment via Server-Sent Events (SSE)
  const startDeployment = () => {
    if (!uploadedFileId) {
      setUploadError(isAr ? "الرجاء رفع واختيار ملف التحديث أولاً" : "Please upload the ZIP update package first");
      return;
    }
    if (!config.pat || !config.owner || !config.repo) {
      setDeployStatus("error");
      addLog("error", isAr ? "يرجى تعبئة الحقول الأساسية لـ GitHub قبل بدء الرفع" : "Please fill in GitHub configuration inputs first");
      return;
    }

    setIsDeploying(true);
    setDeployStatus("processing");
    setLogs([]);
    setDeployStats({
      totalChecked: 0,
      uploaded: 0,
      skipped: 0,
      deleted: 0,
      failed: 0
    });

    const queryParams = new URLSearchParams({
      fileId: uploadedFileId,
      pat: config.pat,
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      message: config.message,
      subfolder: config.subfolder,
      cleanSync: String(config.cleanSync),
      pwaSafeguard: String(config.pwaSafeguard)
    }).toString();

    const eventSource = new EventSource(`/api/deploy-stream?${queryParams}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type, message, data: payload } = data;

        addLog(type, message, payload);

        if (type === "success") {
          setDeployStatus("success");
          setIsDeploying(false);
          if (payload && payload.stats) {
            setDeployStats(payload.stats);
          }
          eventSource.close();
        } else if (type === "error") {
          setDeployStatus("error");
          setIsDeploying(false);
          eventSource.close();
        }
      } catch (e) {
        console.error("Failed to parse SSE event data", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error", err);
      setDeployStatus("error");
      setIsDeploying(false);
      addLog("error", isAr ? "تم قطع الاتصال بالخادم بشكل غير متوقع." : "Server connection closed unexpectedly.");
      eventSource.close();
    };
  };

  const addLog = (type: LogType, message: string, data?: any) => {
    const newEntry: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      data
    };
    setLogs(prev => [...prev, newEntry]);
  };

  // Export JSON backup file
  const exportBackupJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${config.appName.replace(/\s+/g, "_")}_backup_config.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import JSON backup file
  const importBackupJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileReader = new FileReader();
      fileReader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          
          setConfig(prev => ({
            ...prev,
            ...parsed
          }));

          alert(isAr ? "✅ تم استيراد واستعادة البيانات المدخلة بنجاح!" : "✅ Credentials restored successfully!");
        } catch (err) {
          alert(isAr ? "❌ ملف غير صالح. يرجى اختيار ملف نسخة احتياطية صالح." : "❌ Invalid backup file format.");
        }
      };
      fileReader.readAsText(files[0]);
    }
  };

  // Print function
  const triggerPrint = () => {
    window.print();
  };

  const filteredLogs = logs.filter(log => {
    if (logFilter === "all") return true;
    return log.type === logFilter;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans antialiased flex flex-col justify-between" dir={isAr ? "rtl" : "ltr"}>
      
      {/* ----------------- WEB VIEW PAGE (Hidden when printing) ----------------- */}
      <div className="print:hidden flex-1 flex flex-col justify-between">
        
        {/* Modern Header */}
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
                <Github className="h-5 w-5 text-white animate-pulse" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                  <span>{isAr ? "بوابة الأتمتة والمزامنة مع GitHub" : "ZIP to GitHub Sync Portal"}</span>
                  <span className="text-[10px] py-0.5 px-2 rounded-full bg-blue-500/15 text-blue-400 font-mono">
                    v1.3.0-safe
                  </span>
                </h1>
                <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
                  {isAr ? "أتمتة المزامنة الذكية لحماية عرض التطبيقات المثبتة دون شريط المتصفح" : "Automated delta-pushing protecting standalone installed PWA views"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Install PWA Button */}
              <button
                onClick={handleInstallClick}
                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 rounded-xl border border-indigo-500/40 text-[11px] sm:text-xs font-bold transition flex items-center gap-1.5 cursor-pointer text-white shadow-md shadow-indigo-500/15"
              >
                <Smartphone className="h-3.5 w-3.5 text-indigo-200" />
                <span>{isAr ? "تثبيت التطبيق" : "Install App"}</span>
              </button>

              {/* Language Switch */}
              <button
                onClick={toggleLanguage}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700/60 text-[11px] sm:text-xs font-bold transition flex items-center gap-1.5 cursor-pointer text-slate-300"
              >
                <Globe className="h-3.5 w-3.5 text-blue-400" />
                <span>{isAr ? "English" : "العربية"}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
          
          {/* Important explanation Banner */}
          <div className="mb-6 bg-slate-950/80 border border-slate-800 rounded-3xl p-5 text-xs shadow-xl">
            <div className="flex items-start gap-3.5">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl mt-0.5 shrink-0">
                <ShieldCheck className="h-5 w-5 text-blue-400" />
              </div>
              <div className="space-y-1.5 leading-relaxed flex-1">
                <p className="font-bold text-white text-sm flex items-center gap-2">
                  <span>{isAr ? "🔒 حماية هوية الموقع وبصمة التطبيق المثبت (PWA Safeguard)" : "🔒 PWA Identity & Standalone View Safeguard"}</span>
                </p>
                <p className="text-slate-300 text-[11px]">
                  {isAr 
                    ? "لتجنب المشاكل التي تجعل المتصفح يعرض الشريط العلوي أو يغير إعدادات عرض التطبيق المثبت (Standalone display) على هواتف المستخدمين، قمنا بتضمين درع حماية متطور. يمنع هذا النظام حذف الملفات الأساسية مثل manifest.json ومجلد .well-known (الذي يحتوي على ملفات التوافق الرقمي والربط التلقائي للهواتف) وملفات الـ Service Worker، مما يحافظ على استقرار وموثوقية متجرك تماماً."
                    : "To prevent your installed web applications (PWAs) from losing standalone mode and showing the browser's address bar, we implemented an automated safety layer. This ensures that manifest files, service workers, and .well-known (assetlinks) compatibility directories are NEVER deleted during clean sync, keeping the installed application perfectly intact."
                  }
                </p>
              </div>
            </div>
          </div>

          {/* PWA Installation Card */}
          <div className="mb-6 bg-gradient-to-r from-blue-950/30 via-indigo-950/20 to-slate-950 border border-indigo-500/30 rounded-3xl p-5 text-xs shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-indigo-500/15 text-indigo-400 rounded-xl shrink-0">
                <Smartphone className="h-5 w-5 text-indigo-400 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                  {isAr ? "تثبيت الأداة كتطبيق مستقل على الشاشة" : "Install Portal as a Standalone App"}
                  <span className="bg-emerald-500/15 text-emerald-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {isAr ? "جاهز للتثبيت" : "Ready"}
                  </span>
                </h3>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {isAr 
                    ? "قم بتنزيل وتثبيت هذه البوابة كتطبيق مستقل (PWA) لتصل إليها بضغطة زر واحدة من شاشتك الرئيسية والتمتع بمظهر وتجربة تصفح كاملة ومريحة."
                    : "Install this automation portal directly onto your device's home screen as a standalone application for quick, premium access."}
                </p>
              </div>
            </div>
            
            <button
              onClick={handleInstallClick}
              className="sm:self-center bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs px-5 py-3 rounded-2xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 border border-indigo-400/20 whitespace-nowrap cursor-pointer hover:shadow-indigo-500/35"
            >
              <Download className="h-4 w-4 text-indigo-100" />
              <span>{isAr ? "تنزيل وتثبيت التطبيق" : "Download & Install App"}</span>
            </button>
          </div>

          {/* Bento Grid layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT COLUMN: Setup Configuration */}
            <section className="lg:col-span-5 space-y-6">
              
              {/* GitHub Configuration setup */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4.5 w-4.5 text-blue-400 animate-spin-slow" />
                    <h2 className="text-sm font-extrabold text-white">
                      {isAr ? "إعدادات الاتصال بمستودع GitHub" : "GitHub Connection & Settings"}
                    </h2>
                  </div>
                  
                  {/* Backup / Restore Menu Trigger */}
                  <button
                    onClick={() => setShowBackupModal(true)}
                    className="px-2 py-1 text-[10px] font-bold rounded-lg transition bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600/20 cursor-pointer flex items-center gap-1"
                  >
                    <FileJson className="h-3 w-3" />
                    <span>{isAr ? "النسخة الاحتياطية" : "Config Backup"}</span>
                  </button>
                </div>

                {/* Application Name Field */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-semibold flex items-center gap-1">
                    <span>{isAr ? "اسم المشروع أو التطبيق" : "Project / App Name"}</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={config.appName}
                    onChange={(e) => setConfig({ ...config, appName: e.target.value })}
                    placeholder={isAr ? "مثال: متجر أم روح" : "e.g. My Custom Store"}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-medium transition outline-none text-white"
                  />
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {isAr ? "يستخدم لتسمية وحفظ ملف النسخة الاحتياطية وقائمة الطباعة لتسهيل التمييز." : "Used to label and organize your credentials printout and JSON backup."}
                  </p>
                </div>

                {/* GitHub Personal Access Token (PAT) */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <span>{isAr ? "رمز الوصول الشخصي (Fine-grained Token)" : "Personal Access Token (PAT)"}</span>
                      <span className="text-red-500">*</span>
                    </span>
                    <a 
                      href="https://github.com/settings/tokens?type=beta" 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-[10px] text-blue-400 hover:underline flex items-center gap-0.5"
                    >
                      {isAr ? "إنشاء توكن مطور" : "Create Beta Token"} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 right-3 flex items-center text-slate-500 pl-3">
                      <Lock className="h-4 w-4" />
                    </span>
                    <input
                      type={showToken ? "text" : "password"}
                      value={config.pat}
                      onChange={(e) => setConfig({ ...config, pat: e.target.value })}
                      placeholder="github_pat_..."
                      className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl py-2.5 px-4 pr-10 text-xs font-mono transition outline-none text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute inset-y-0 left-3 flex items-center text-slate-400 hover:text-white"
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {isAr 
                      ? "💡 نصيحة أمان: قم بإنشاء Fine-grained token محصور فقط بمستودع المتجر، وحدد له صلاحيات Contents بمستوى Read & Write." 
                      : "💡 Safe tip: Create a Fine-grained token scoped only to your target repository with Contents: Read & Write permission."}
                  </p>
                </div>

                {/* Repository Owner & Name */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 font-semibold flex items-center gap-1">
                      <span>{isAr ? "اسم مالك الحساب" : "Repo Owner"}</span>
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={config.owner}
                      onChange={(e) => setConfig({ ...config, owner: e.target.value.trim() })}
                      placeholder="octocat"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs transition outline-none text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 font-semibold flex items-center gap-1">
                      <span>{isAr ? "اسم المستودع" : "Repo Name"}</span>
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={config.repo}
                      onChange={(e) => setConfig({ ...config, repo: e.target.value.trim() })}
                      placeholder="store-app"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs transition outline-none text-white"
                    />
                  </div>
                </div>

                {/* Target Branch and optional subfolder */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 font-semibold">
                      {isAr ? "الفرع النشط (Branch)" : "Target Branch"}
                    </label>
                    <input
                      type="text"
                      value={config.branch}
                      onChange={(e) => setConfig({ ...config, branch: e.target.value || "main" })}
                      placeholder="main"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs transition outline-none text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 font-semibold flex items-center gap-1">
                      <span>{isAr ? "مجلد فرعي (اختياري)" : "Subfolder (Optional)"}</span>
                      <span className="group relative cursor-help">
                        <HelpCircle className="h-3 w-3 text-slate-500" />
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-950 border border-slate-700 text-[10px] text-slate-300 p-2 rounded-lg w-48 shadow-lg text-center z-50 leading-relaxed">
                          {isAr ? "استخدمه إذا كان كود موقعك لا يقع في الجذر بل بداخل مجلد فرعي بالمستودع" : "Specify if your code lives in a subdirectory of your repository"}
                        </span>
                      </span>
                    </label>
                    <input
                      type="text"
                      value={config.subfolder}
                      onChange={(e) => setConfig({ ...config, subfolder: e.target.value.trim() })}
                      placeholder="e.g. src"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs transition outline-none text-white"
                    />
                  </div>
                </div>

                {/* Commit message input */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-semibold">
                    {isAr ? "رسالة الالتزام المعتمدة (Commit Message)" : "Commit Message"}
                  </label>
                  <input
                    type="text"
                    value={config.message}
                    onChange={(e) => setConfig({ ...config, message: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs transition outline-none text-white"
                  />
                </div>

                {/* PWA Safeguard Settings Option */}
                <div className="p-3.5 bg-blue-950/20 rounded-2xl border border-blue-500/20 flex items-start gap-3">
                  <div className="flex items-center h-5">
                    <input
                      id="pwaSafeguard"
                      type="checkbox"
                      checked={config.pwaSafeguard}
                      onChange={(e) => setConfig({ ...config, pwaSafeguard: e.target.checked })}
                      className="h-4 w-4 rounded border-blue-500 text-blue-600 bg-slate-900 focus:ring-blue-500 focus:ring-offset-slate-900"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label htmlFor="pwaSafeguard" className="text-xs font-bold text-blue-300 cursor-pointer select-none flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{isAr ? "تفعيل درع حماية التطبيق المثبت" : "Enable PWA Safeguard Shield"}</span>
                    </label>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      {isAr 
                        ? "يمنع حذف ملفات التوافق الرقمي والـ manifest والـ sw في المستودع لضمان احتفاظ المستخدمين بعرض standalone بدون شريط المتصفح."
                        : "Ensures that digital assetlinks, PWA manifest, and service-workers are safe from deletion to preserve full-screen display."}
                    </p>
                  </div>
                </div>

                {/* Clean Sync Selection */}
                <div className="p-3.5 bg-slate-900/50 rounded-2xl border border-slate-800/80 flex items-start gap-3">
                  <div className="flex items-center h-5">
                    <input
                      id="cleanSync"
                      type="checkbox"
                      checked={config.cleanSync}
                      onChange={(e) => setConfig({ ...config, cleanSync: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-800 text-blue-600 bg-slate-900 focus:ring-blue-500 focus:ring-offset-slate-900"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label htmlFor="cleanSync" className="text-xs font-bold text-white cursor-pointer select-none">
                      {isAr ? "تفعيل المزامنة العميقة (Delete Orphan Files)" : "Enable Deep Clean Sync"}
                    </label>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      {isAr 
                        ? "⚠️ في حال تفعيله: سيتم حذف أي ملفات قديمة موجودة في المستودع ولكنها غير متواجدة داخل ملف الـ ZIP المرفوع لجعل الكود متطابقاً 100%."
                        : "⚠️ Caution: Automatically deletes any file in the GitHub repository directory that does not exist in the uploaded ZIP."}
                    </p>
                  </div>
                </div>

                {/* Local Cache Toggle & Test Connection */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800/60">
                  <div className="flex items-center gap-1.5">
                    <input
                      id="saveCache"
                      type="checkbox"
                      checked={saveConfig}
                      onChange={(e) => setSaveConfig(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-800 text-blue-600 bg-slate-900"
                    />
                    <label htmlFor="saveCache" className="text-[11px] text-slate-400 select-none cursor-pointer flex items-center gap-1">
                      <Save className="h-3 w-3" />
                      <span>{isAr ? "تخزين البيانات بالمتصفح" : "Save settings locally"}</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={connectionStatus === "testing"}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 hover:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {connectionStatus === "testing" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 text-blue-400" />
                    )}
                    <span>{isAr ? "اختبار الاتصال" : "Test Connection"}</span>
                  </button>
                </div>

                {/* Connection Alert Indicator */}
                {connectionStatus !== "idle" && (
                  <div className={`p-3.5 rounded-2xl text-xs flex items-start gap-2 ${
                    connectionStatus === "success" 
                      ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300" 
                      : connectionStatus === "error" 
                      ? "bg-rose-950/40 border border-rose-500/30 text-rose-300" 
                      : "bg-slate-900 border border-slate-800 text-slate-300"
                  }`}>
                    {connectionStatus === "success" ? (
                      <>
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-white">
                            {isRepoEmptyState 
                              ? (isAr ? "تم الاتصال بنجاح (مستودع جديد فارغ)!" : "Connected Successfully (Empty Repo)!")
                              : (isAr ? "تم الاتصال بـ GitHub بنجاح!" : "Connected to GitHub Successfully!")}
                          </p>
                          <p className="text-[10px] text-emerald-300/90 leading-relaxed font-semibold">
                            {isRepoEmptyState ? (
                              isAr 
                                ? `✨ تم التحقق من الـ Token والمستودع بنجاح! نظراً لأن المستودع فارغ وجديد تماماً، سيقوم النظام تلقائياً بإنشاء الفرع "${config.branch}" ورفع وتأسيس كل ملفات المتجر بمجرد الضغط على زر "بدء نشر الملفات" أدناه.`
                                : `✨ Token and repository verified successfully! Since your repository is brand new and completely empty, the system will automatically create the "${config.branch}" branch and commit all store files when you click the "Start Deployment" button below.`
                            ) : (
                              isAr 
                                ? "تم التحقق من رمز الوصول بنجاح والمستودع والفرع جاهزان لاستقبال التحديثات." 
                                : "Token authorized. Target branch read reference verified successfully."
                            )}
                          </p>
                        </div>
                      </>
                    ) : connectionStatus === "error" ? (
                      (() => {
                        let parsedError: {
                          status?: number;
                          hasPushAccess?: boolean;
                          type?: "repo" | "branch" | "other";
                          branch?: string;
                          githubMessage?: string;
                          documentationUrl?: string;
                          message?: string;
                        } = {};
                        
                        try {
                          parsedError = JSON.parse(connectionError);
                        } catch {
                          parsedError = { message: connectionError };
                        }

                        return (
                          <>
                            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                            <div className="space-y-2.5 flex-1 min-w-0">
                              <p className="font-bold text-white text-xs sm:text-sm">
                                {isAr ? "فشل التحقق من الاتصال بمستودع GitHub" : "GitHub Connection Verification Failed"}
                              </p>
                              
                              <div className="bg-rose-950/25 border border-rose-500/20 rounded-2xl p-3.5 space-y-2.5 text-[11px] leading-relaxed text-slate-300">
                                {parsedError.status !== undefined && (
                                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-rose-300">
                                    <span className="font-bold bg-rose-500/20 py-0.5 px-2 rounded-lg text-[10px]">
                                      HTTP {parsedError.status}
                                    </span>
                                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                                      {parsedError.status === 401 && (isAr ? "غير مصرح (Unauthorized)" : "Unauthorized")}
                                      {parsedError.status === 403 && (isAr ? "وصول مرفوض (Forbidden)" : "Access Forbidden")}
                                      {parsedError.status === 404 && (isAr ? "لم يتم العثور عليه (Not Found / Access Denied)" : "Not Found / Access Denied")}
                                      {parsedError.status === 0 && (isAr ? "خطأ شبكة (Network Error)" : "Network Error")}
                                    </span>
                                  </div>
                                )}

                                <p className="text-slate-200 font-bold text-xs">
                                  {parsedError.message}
                                </p>

                                {parsedError.githubMessage && (
                                  <div className="border-t border-rose-500/10 pt-2.5 mt-1 space-y-1">
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono">
                                      {isAr ? "رسالة الخطأ الرسمية من API GitHub:" : "Official GitHub API Error:"}
                                    </p>
                                    <p className="font-mono text-[10px] bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 text-rose-300/90 break-all select-all leading-relaxed">
                                      {parsedError.githubMessage}
                                    </p>
                                  </div>
                                )}

                                {parsedError.documentationUrl && (
                                  <p className="text-[10px] text-slate-400 pt-1">
                                    <span className="font-bold">{isAr ? "رابط مستندات GitHub المساعد:" : "GitHub Docs link:"} </span>
                                    <a 
                                      href={parsedError.documentationUrl} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
                                    >
                                      {parsedError.documentationUrl} <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                  </p>
                                )}
                              </div>

                              {/* Actionable troubleshooting list */}
                              <div className="border-t border-slate-800/80 pt-2.5 text-[10px] text-slate-400 space-y-1.5">
                                <p className="font-bold text-slate-300 flex items-center gap-1">
                                  <span>{isAr ? "💡 قائمة التحقق المقترحة للحل:" : "💡 Recommended Troubleshooting steps:"}</span>
                                </p>
                                <ul className="list-disc list-inside space-y-1 text-[10px] text-slate-400 pl-1">
                                  {parsedError.status === 401 && (
                                    <>
                                      <li>{isAr ? "تأكد من نسخ رمز الـ Token كاملاً ولا يحتوي على مسافات زائدة." : "Verify you copied the token completely with no leading or trailing whitespace."}</li>
                                      <li>{isAr ? "تحقق من عدم انتهاء صلاحية الـ Token في إعدادات مطوري GitHub." : "Check if the token has expired in your GitHub Developer settings."}</li>
                                    </>
                                  )}
                                  {parsedError.status === 404 && (
                                    <>
                                      <li>{isAr ? "تأكد من كتابة اسم المالك (Owner) واسم المستودع (Repository) بشكل صحيح حرفياً." : "Verify the spelling of Owner and Repository exactly."}</li>
                                      <li>{isAr ? "إذا كان المستودع خاصاً (Private)، تأكد من أن الـ Token يمتلك صلاحية الوصول للمستودعات الخاصة." : "If the repository is private, ensure your token has explicit private repo permissions."}</li>
                                      <li>{isAr ? "في Fine-grained Token، يرجى التأكد من اختيار المستودع الصحيح في خانة Repository Access." : "In Fine-grained token settings, ensure the repository is selected under Repository Access."}</li>
                                    </>
                                  )}
                                  {parsedError.status === 403 && (
                                    <>
                                      <li>{isAr ? "تأكد من منح صلاحية Contents بمستوى Read & Write للرمز (Token)." : "Verify you granted Read & Write access to 'Contents' in your token settings."}</li>
                                      <li>{isAr ? "تأكد من منح صلاحية Metadata بمستوى Read-only (تُفعل تلقائياً عادةً)." : "Ensure 'Metadata' is granted Read-only permissions."}</li>
                                    </>
                                  )}
                                  {parsedError.hasPushAccess === false && (
                                    <>
                                      <li>{isAr ? "قم بتعديل الـ Token في إعدادات GitHub وامنحه صلاحية الكتابة Contents (Read and Write)." : "Go to your token settings on GitHub and upgrade 'Contents' to Read and Write access."}</li>
                                    </>
                                  )}
                                  {parsedError.type === "branch" && (
                                    <>
                                      <li>{isAr ? "تحقق من مطابقة اسم الفرع (مثال: main أو master) تماماً مع الفرع المنشأ على GitHub." : "Confirm the branch name matches the one present in your repository."}</li>
                                      <li>{isAr ? "إذا كان المستودع فارغاً، قم بإنشاء ملف README.md يدوياً عبر موقع GitHub أولاً لتهيئة الفرع الافتراضي." : "If the repository is empty, create a README.md file directly on GitHub to initialize the default branch."}</li>
                                    </>
                                  )}
                                  <li>{isAr ? "تأكد من أن الرمز لا يزال صالحاً ولم يتم حذفه أو إلغاؤه من GitHub." : "Ensure the personal access token is still active and has not been revoked."}</li>
                                </ul>
                              </div>
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <Loader2 className="h-4.5 w-4.5 text-blue-400 animate-spin shrink-0 mt-0.5" />
                        <p className="text-slate-300">{isAr ? "جاري التحقق من التوكن وصلاحيات المستودع..." : "Connecting to GitHub REST API..."}</p>
                      </>
                    )}
                  </div>
                )}

              </div>

              {/* Upload ZIP Package Card */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800/60 pb-3">
                  <Upload className="h-4.5 w-4.5 text-blue-400" />
                  <h2 className="text-sm font-extrabold text-white">
                    {isAr ? "حزمة التحديث المرفوعة (ZIP)" : "ZIP Upload Center"}
                  </h2>
                </div>

                {/* Drag and Drop Zone */}
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 min-h-[160px] ${
                    file 
                      ? "border-blue-500/50 bg-blue-950/10" 
                      : "border-slate-800 hover:border-slate-700 hover:bg-slate-900/30"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".zip"
                    className="hidden"
                  />
                  
                  <div className={`p-3 rounded-full ${file ? "bg-blue-600/20 text-blue-400" : "bg-slate-900 text-slate-400"}`}>
                    <UploadCloud className="h-6 w-6" />
                  </div>

                  {file ? (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-white truncate max-w-[220px] mx-auto">{file.name}</p>
                      <p className="text-[10px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-white">
                        {isAr ? "اسحب وأفلت ملف ZIP هنا" : "Drag and drop ZIP archive here"}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {isAr ? "أو اضغط لتصفح ملفاتك المحلية" : "or click to select file locally"}
                      </p>
                    </div>
                  )}
                </div>

                {uploadError && (
                  <div className="p-3 bg-rose-950/40 border border-rose-500/30 text-rose-300 rounded-2xl text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* Upload Trigger Button */}
                {file && !uploadedFileId && (
                  <div className="space-y-3 pt-1">
                    {uploadProgress !== null ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                          <span>{isAr ? "جاري الرفع وفك الضغط مؤقتاً..." : "Uploading package to server..."}</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-blue-500 h-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={uploadZipFile}
                        disabled={isUploading}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                            <span>{isAr ? "جاري الرفع..." : "Uploading..."}</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            <span>{isAr ? "تأكيد ورفع الحزمة" : "Upload and Extract Package"}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Staged Upload Ready State */}
                {uploadedFileId && (
                  <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 p-4 rounded-2xl text-xs space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-white">{isAr ? "تم الرفع والتحليل المبدئي بنجاح" : "Package Staged & Verified"}</p>
                        <p className="text-[10px] text-emerald-400/80 leading-relaxed">
                          {isAr 
                            ? "ملف التحديث مفكك ومستعد على الخادم. يمكنك الآن تشغيل عملية المزامنة مع GitHub." 
                            : "Your ZIP contents have been read. Click the deploy trigger on the right to sync."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-emerald-500/20 pt-2.5 text-[10px]">
                      <span className="text-slate-400">{isAr ? "حجم الحزمة الجاهزة:" : "Uploaded zip size:"}</span>
                      <span className="font-mono font-bold text-white">
                        {file ? (file.size / 1024 / 1024).toFixed(2) : "0"} MB
                      </span>
                    </div>
                  </div>
                )}

              </div>

            </section>

            {/* RIGHT COLUMN: Deployment Controls, progress & realtime terminal streaming */}
            <section className="lg:col-span-7 space-y-6">
              
              {/* Deploy Trigger Button & Stats */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Play className="h-4.5 w-4.5 text-blue-400 animate-pulse" />
                    <h2 className="text-sm font-extrabold text-white">
                      {isAr ? "لوحة المزامنة والنشر للإنتاج" : "Sync Control Room"}
                    </h2>
                  </div>
                  <span className={`text-[10px] py-1 px-3.5 rounded-full font-bold ${
                    deployStatus === "processing" 
                      ? "bg-blue-500/15 text-blue-400 animate-pulse" 
                      : deployStatus === "success" 
                      ? "bg-emerald-500/15 text-emerald-400" 
                      : deployStatus === "error" 
                      ? "bg-rose-500/15 text-rose-400" 
                      : "bg-slate-900 text-slate-400"
                  }`}>
                    {deployStatus === "processing" && (isAr ? "جاري الرفع والمقارنة..." : "Deploying...")}
                    {deployStatus === "success" && (isAr ? "اكتمل الرفع والمزامنة بنجاح 🎉" : "Sync Succeeded 🎉")}
                    {deployStatus === "error" && (isAr ? "فشلت العملية" : "Failed")}
                    {deployStatus === "idle" && (isAr ? "بانتظار البدء" : "Ready")}
                  </span>
                </div>

                {/* Primary start button */}
                <button
                  type="button"
                  onClick={startDeployment}
                  disabled={!uploadedFileId || isDeploying}
                  className={`w-full py-3.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    uploadedFileId 
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xl shadow-blue-500/10" 
                      : "bg-slate-900 border border-slate-800 text-slate-500"
                  }`}
                >
                  {isDeploying ? (
                    <>
                      <Loader2 className="h-4 animate-spin text-white" />
                      <span>{isAr ? "جاري حساب البصمة ورفع التعديلات..." : "Calculating SHA-1 & pushing files..."}</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      <span>{isAr ? "إطلاق عملية تحديث الموقع ومزامنة الكود" : "Automate Sync & Deploy to GitHub"}</span>
                    </>
                  )}
                </button>

                {/* Stats panel summary */}
                {(deployStatus === "processing" || logs.length > 0) && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
                    <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-2xl text-center">
                      <p className="text-[10px] text-slate-400">{isAr ? "إجمالي الكود" : "Total Files"}</p>
                      <p className="text-sm font-extrabold text-white mt-1 font-mono">
                        {deployStats.totalChecked || "-"}
                      </p>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-2xl text-center">
                      <p className="text-[10px] text-emerald-400">{isAr ? "تم رفعه" : "Pushed"}</p>
                      <p className="text-sm font-extrabold text-emerald-400 mt-1 font-mono">
                        {deployStats.uploaded || "0"}
                      </p>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-2xl text-center">
                      <p className="text-[10px] text-slate-400">{isAr ? "لم يتغير" : "Identical"}</p>
                      <p className="text-sm font-extrabold text-slate-300 mt-1 font-mono">
                        {deployStats.skipped || "0"}
                      </p>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-2xl text-center">
                      <p className="text-[10px] text-rose-400">{isAr ? "المحذوفات" : "Deleted"}</p>
                      <p className="text-sm font-extrabold text-rose-400 mt-1 font-mono">
                        {deployStats.deleted || "0"}
                      </p>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-2xl text-center col-span-2 sm:col-span-1">
                      <p className="text-[10px] text-amber-500">{isAr ? "أخطاء ملفات" : "Failed"}</p>
                      <p className="text-sm font-extrabold text-amber-500 mt-1 font-mono">
                        {deployStats.failed || "0"}
                      </p>
                    </div>
                  </div>
                )}

                {/* 403 Write Permission Troubleshooting Box */}
                {deployStatus === "error" && logs.some(l => l.type === "warn" && l.message.includes("403")) && (
                  <div className="bg-rose-950/20 border border-rose-500/30 p-4.5 rounded-2xl space-y-3.5 text-xs text-left">
                    <div className="flex gap-2 text-rose-400 font-bold items-center">
                      <AlertTriangle className="h-5 w-5 shrink-0" />
                      <span>
                        {isAr 
                          ? "تم كشف خطأ الصلاحيات (403 Forbidden) أثناء رفع الملفات!" 
                          : "Detected Write Authorization Error (403 Forbidden)!"}
                      </span>
                    </div>
                    
                    <div className="text-[11px] leading-relaxed text-slate-300 space-y-2">
                      <p className="font-bold text-slate-200">
                        {isAr 
                          ? "خطأ 403 (Resource not accessible by personal access token) يعني أن رمز الوصول الخاص بك (Token) صالح كرمز للاتصال، ولكنه يفتقر إلى صلاحية الكتابة (Contents: Read and Write) لتعديل الملفات على هذا المستودع المحدد."
                          : "A 403 (Resource not accessible by personal access token) status means your token is authenticated but doesn't have write permissions (Contents: Read and Write) to modify files in this specific repository."}
                      </p>

                      <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2 text-slate-300">
                        <p className="font-semibold text-amber-400">
                          {isAr ? "💡 كيفية حل هذه المشكلة بالخطوات:" : "💡 How to fix this step-by-step:"}
                        </p>
                        <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[10.5px]">
                          {isAr ? (
                            <>
                              <li>اذهب إلى حسابك في <b>GitHub</b> ثم الإعدادات <b>(Settings)</b> &rarr; إعدادات المطورين <b>(Developer settings)</b> &rarr; <b>Personal Access Tokens</b> &rarr; <b>Fine-grained tokens</b>.</li>
                              <li>اضغط على اسم الرمز <b>(Token)</b> الذي تستخدمه لتعديل إعداداته.</li>
                              <li>تحت قسم <b>Repository access</b>، تأكد من اختيار <b>All repositories</b> أو قم باختيار المستودع الجديد <code>yosifmohamedalhmery771-boop/mtjromrooh</code> يدوياً (لأن المستودع المنشأ حديثاً لا ينضم تلقائياً للرموز محددة المستودعات).</li>
                              <li>تحت قسم <b>Repository permissions</b>، ابحث عن <b>Contents</b> ثم غير الصلاحية من Access إلى <b>Read and Write</b>.</li>
                              <li>اضغط على <b>Update token</b> في أسفل الصفحة لحفظ التعديلات، ثم ارجع هنا واضغط على زر المزامنة مجدداً!</li>
                            </>
                          ) : (
                            <>
                              <li>Go to <b>GitHub</b> &rarr; <b>Settings</b> &rarr; <b>Developer settings</b> &rarr; <b>Personal Access Tokens</b> &rarr; <b>Fine-grained tokens</b>.</li>
                              <li>Click on the token you are using to edit its details.</li>
                              <li>Under <b>Repository access</b>, ensure you choose <b>All repositories</b>, or manually select your new repository <code>yosifmohamedalhmery771-boop/mtjromrooh</code> from the dropdown list.</li>
                              <li>Under <b>Repository permissions</b>, locate <b>Contents</b> and change access to <b>Read and Write</b>.</li>
                              <li>Scroll down and click <b>Update token</b>. Once saved, come back here and click the deploy button again!</li>
                            </>
                          )}
                        </ol>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Streaming live Terminal Logs console */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-4 flex flex-col h-[420px]">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4.5 w-4.5 text-blue-400" />
                    <h2 className="text-sm font-extrabold text-white">
                      {isAr ? "مراقب المزامنة المباشر (Terminal)" : "Live SSE Deployment Terminal"}
                    </h2>
                  </div>

                  {/* Log Filtering list */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                    <button
                      onClick={() => setLogFilter("all")}
                      className={`px-2 py-1 text-[9px] font-bold rounded-lg transition shrink-0 cursor-pointer ${
                        logFilter === "all" ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {isAr ? "الكل" : "All"} ({logs.length})
                    </button>
                    <button
                      onClick={() => setLogFilter("progress")}
                      className={`px-2 py-1 text-[9px] font-bold rounded-lg transition shrink-0 cursor-pointer ${
                        logFilter === "progress" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {isAr ? "العمليات" : "File Ops"} ({logs.filter(l => l.type === "progress").length})
                    </button>
                    <button
                      onClick={() => setLogFilter("warn")}
                      className={`px-2 py-1 text-[9px] font-bold rounded-lg transition shrink-0 cursor-pointer ${
                        logFilter === "warn" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {isAr ? "تحذيرات" : "Warnings"} ({logs.filter(l => l.type === "warn").length})
                    </button>
                  </div>
                </div>

                {/* Actual logs print window */}
                <div className="flex-1 overflow-y-auto bg-slate-900/60 border border-slate-850 p-4 rounded-2xl font-mono text-[11px] leading-relaxed space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
                  {filteredLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-2">
                      <Terminal className="h-8 w-8 text-slate-700" />
                      <p>{isAr ? "بانتظار بدء عملية الرفع لعرض سجلات الأحداث المباشرة..." : "Logs will stream here in real-time when deployment starts."}</p>
                    </div>
                  ) : (
                    filteredLogs.map((log) => {
                      let typeClass = "text-slate-300";
                      let typeLabel = "INFO";

                      if (log.type === "progress") {
                        if (log.message.includes("[SKIPPED]")) {
                          typeClass = "text-slate-400";
                          typeLabel = "SKIP";
                        } else if (log.message.includes("[DELETING]") || log.message.includes("[DELETED]")) {
                          typeClass = "text-rose-400";
                          typeLabel = "DEL";
                        } else {
                          typeClass = "text-blue-400";
                          typeLabel = "COMM";
                        }
                      } else if (log.type === "success") {
                        typeClass = "text-emerald-400 font-bold";
                        typeLabel = "DONE";
                      } else if (log.type === "error") {
                        typeClass = "text-rose-500 font-bold";
                        typeLabel = "ERR";
                      } else if (log.type === "warn") {
                        typeClass = "text-amber-500";
                        typeLabel = "WARN";
                      }

                      return (
                        <div key={log.id} className={`py-0.5 border-b border-slate-850/30 flex items-start gap-2 ${typeClass}`}>
                          <span className="text-[10px] text-slate-500 shrink-0 select-none">
                            [{log.timestamp}]
                          </span>
                          <span className="text-[9px] font-extrabold uppercase px-1 rounded bg-slate-800 text-slate-400 shrink-0 select-none min-w-[36px] text-center">
                            {typeLabel}
                          </span>
                          <span className="break-all whitespace-pre-wrap">{log.message}</span>
                        </div>
                      );
                    })
                  )}
                  <div ref={logsEndRef} />
                </div>

              </div>

            </section>

          </div>

        </main>

        {/* Informative Footer */}
        <footer className="bg-slate-950 border-t border-slate-850 py-8 text-xs text-slate-400 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-slate-800/50 pb-6 text-slate-300">
              <div>
                <h3 className="font-bold text-white text-xs mb-2 flex items-center gap-1.5">
                  <FileCheck className="h-4 w-4 text-blue-400" />
                  <span>{isAr ? "الخطوة ١: تجميع الكود المحدث" : "Step 1: Package Changes"}</span>
                </h3>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  {isAr 
                    ? "قم بتجميع كود تحديث موقعك في ملف ZIP واحد ثم ارفعه هنا. نوصي باستبعاد مجلدات node_modules لتقليل الحجم وزيادة السرعة." 
                    : "Pack your updated codebase as a ZIP archive. Exclude node_modules or heavy media folders to optimize transfer speed."}
                </p>
              </div>
              <div>
                <h3 className="font-bold text-white text-xs mb-2 flex items-center gap-1.5">
                  <RefreshCw className="h-4 w-4 text-blue-400" />
                  <span>{isAr ? "الخطوة ٢: مقارنة وحساب الـ SHA" : "Step 2: Compare & Delta-Push"}</span>
                </h3>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  {isAr 
                    ? "يقوم النظام بمقارنة الـ SHA-1 للملفات تلقائياً مع GitHub. نرفع فقط الفروقات والملفات المعدلة، ونتخطى المتطابق لتسريع الرفع وحمايتك من حد الاستهلاك للـ API." 
                    : "The utility calculates hashes and compares them with your remote repository tree. Only modified assets are committed sequentially."}
                </p>
              </div>
              <div>
                <h3 className="font-bold text-white text-xs mb-2 flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-blue-400" />
                  <span>{isAr ? "الخطوة ٣: استلام وبناء Vercel" : "Step 3: Auto-Build on Vercel"}</span>
                </h3>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  {isAr 
                    ? "بمجرد كتابة التعديلات بالمستودع، يستشعر Vercel حدث الـ push فوراً ويبدأ ببناء تلقائي آمن يحافظ على استمرارية الخدمة ورابط الموقع ثابتاً تماماً." 
                    : "As soon as changes are written, Vercel automatically detects the push event and triggers a live production rebuild with no downtime."}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-400">{isAr ? "مدير المزامنة السريعة للإنتاج" : "PWA Deployment Utility Manager"}</span>
              </div>
              <div className="text-[11px]">
                &copy; 2026 {isAr ? "بوابة الأتمتة والنشر لـ GitHub. جميع الحقوق محفوظة." : "ZIP to GitHub CD Manager. All rights reserved."}
              </div>
            </div>

          </div>
        </footer>

      </div>


      {/* ----------------- LOCAL CONFIGURATION BACKUP MODAL ----------------- */}
      {showBackupModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl relative" dir={isAr ? "rtl" : "ltr"}>
            
            <button
              onClick={() => setShowBackupModal(false)}
              className="absolute top-4 left-4 right-auto sm:left-4 sm:right-auto rtl:right-4 rtl:left-auto text-slate-400 hover:text-white font-extrabold text-sm p-1"
            >
              ✕
            </button>

            <div className="space-y-2">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <FileJson className="h-5 w-5 text-blue-400" />
                <span>{isAr ? "تصدير واستعادة نسخة احتياطية من البيانات" : "Credentials Backup Control"}</span>
              </h3>
              <p className="text-xs text-slate-400 leading-normal">
                {isAr 
                  ? "لتبسيط العملية ومنع فقدان البيانات المدخلة (مثل رمز التوكن السري وأسماء المستودعات) في حال قمت بمسح كاش المتصفح، يمكنك حفظها محلياً بأمان تام وتصديرها."
                  : "Export your current credentials to a safe local file or printout sheet to prevent losing them when clearing cookies/cache."}
              </p>
            </div>

            <div className="space-y-4">
              
              {/* Option 1: Print Beautiful Card (PDF-Ready) */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2.5">
                  <Printer className="h-5 w-5 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      {isAr ? "طريقة ١: طباعة / حفظ كملف PDF" : "Option 1: Save as PDF / Print Card"}
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {isAr 
                        ? "يفتح ورقة طباعة مخصصة ومنسقة كارت بيانات أمان للمشروع لحفظها كملف PDF بجهازك."
                        : "Format credentials into a highly structured secure dashboard printout & save as vector PDF."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowBackupModal(false);
                    setTimeout(triggerPrint, 300);
                  }}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  <span>{isAr ? "فتح ورقة الطباعة وحفظ للـ PDF" : "Print & Save to PDF"}</span>
                </button>
              </div>

              {/* Option 2: Download Back-up JSON file */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2.5">
                  <Download className="h-5 w-5 text-blue-400 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      {isAr ? "طريقة ٢: تحميل كملف احتياطي مشفر (JSON)" : "Option 2: Download JSON Configuration Backup"}
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {isAr 
                        ? "يحمل ملف كود خفيف يحتوي على إعداداتك لاسترجاعها بنقرة واحدة في أي وقت."
                        : "Downloads a compact config.json file allowing instant credential restore anytime."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={exportBackupJSON}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>{isAr ? "تحميل النسخة الاحتياطية (JSON)" : "Download Configuration (JSON)"}</span>
                </button>
              </div>

              {/* Option 3: Restore / Import JSON Backup File */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2.5">
                  <Upload className="h-5 w-5 text-amber-400 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      {isAr ? "طريقة ٣: استعادة وتعبئة البيانات من ملف سابق" : "Option 3: Restore Credentials from Backup File"}
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {isAr 
                        ? "اختر ملف الـ JSON الذي قمت بتحميله مسبقاً لتعبئة البيانات تلقائياً."
                        : "Select your previously downloaded config.json file to autofill all inputs."}
                    </p>
                  </div>
                </div>
                
                <input
                  type="file"
                  ref={backupImportRef}
                  onChange={importBackupJSON}
                  accept=".json"
                  className="hidden"
                />

                <button
                  onClick={() => backupImportRef.current?.click()}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="h-4 w-4" />
                  <span>{isAr ? "رفع واستيراد نسخة احتياطية (JSON)" : "Upload Backup File"}</span>
                </button>
              </div>

            </div>

            <div className="pt-2 text-center text-[10px] text-slate-500 border-t border-slate-800">
              {isAr 
                ? "🔒 جميع رموز التوكن والبيانات مشفرة ومخزنة محلياً في جهازك تماماً ولا تمر عبر سيرفرات خارجية." 
                : "🔒 All tokens and parameters are securely processed locally inside your browser sandbox."}
            </div>
          </div>
        </div>
      )}


      {/* ----------------- PRINT ONLY VIEW (Hidden on Web Screen, Shows on Printer/PDF Export) ----------------- */}
      <div className="hidden print:block bg-white text-slate-900 p-10 min-h-screen w-full font-serif" dir={isAr ? "rtl" : "ltr"}>
        
        {/* Certificate Border layout */}
        <div className="border-4 border-slate-800 p-8 space-y-8 rounded-3xl max-w-4xl mx-auto">
          
          {/* Print Header */}
          <div className="text-center space-y-2 border-b-2 border-slate-300 pb-6">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {isAr ? "بيانات الربط والأمان الاحتياطية" : "Secure Connection Credentials Card"}
            </h1>
            <p className="text-sm text-slate-500 font-sans">
              {isAr ? "بوابة النشر السريع لـ GitHub وأتمتة التحديثات" : "ZIP to GitHub Sync Manager Config Sheet"}
            </p>
            <div className="text-[11px] font-mono text-slate-400 pt-1">
              {isAr ? "تاريخ الحفظ والطباعة:" : "Printed on:"} {new Date().toLocaleDateString()} - {new Date().toLocaleTimeString()}
            </div>
          </div>

          {/* Configuration Grid */}
          <div className="space-y-6">
            <h2 className="text-base font-extrabold text-slate-800 border-b border-slate-200 pb-1">
              {isAr ? "معلومات المشروع والربط المعتمدة:" : "Staged Repository Parameters:"}
            </h2>

            <div className="grid grid-cols-2 gap-y-4 text-xs font-sans">
              <div className="space-y-1">
                <span className="text-slate-400 font-semibold text-[11px] block">{isAr ? "اسم المشروع/التطبيق:" : "Project App Name:"}</span>
                <span className="font-extrabold text-slate-900 text-sm">{config.appName}</span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-semibold text-[11px] block">{isAr ? "اسم مستودع الكود (Repo Name):" : "Target Repository Name:"}</span>
                <span className="font-bold text-slate-900 text-sm font-mono">{config.repo}</span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-semibold text-[11px] block">{isAr ? "مالك حساب GitHub (Owner):" : "Repository Owner:"}</span>
                <span className="font-bold text-slate-900 text-sm font-mono">{config.owner}</span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-semibold text-[11px] block">{isAr ? "الفرع المعتمد (Target Branch):" : "Committed Branch:"}</span>
                <span className="font-bold text-slate-900 text-sm font-mono">{config.branch}</span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-semibold text-[11px] block">{isAr ? "درع حماية التطبيق المثبت (PWA Safeguard):" : "PWA Display Safeguard Status:"}</span>
                <span className="font-bold text-emerald-600 text-sm">
                  {config.pwaSafeguard ? (isAr ? "مفعل (يحمي ملفات manifest و assetlinks)" : "Active (Protecting manifest & assetlinks)") : (isAr ? "غير مفعل" : "Disabled")}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-semibold text-[11px] block">{isAr ? "مجلد داخلي فرعي (Subfolder Prefix):" : "Repository Subfolder Prefix:"}</span>
                <span className="font-bold text-slate-900 text-sm font-mono">{config.subfolder || (isAr ? "لا يوجد (جذر المستودع)" : "Root level (None)")}</span>
              </div>
            </div>

            {/* Secret Personal Access Token Block */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 mt-4">
              <span className="text-slate-400 font-semibold text-[11px] block font-sans">
                {isAr ? "رمز الدخول الشخصي السري (Personal Access Token):" : "GitHub Personal Access Token (PAT):"}
              </span>
              <div className="font-mono text-[13px] text-slate-800 break-all select-all font-bold p-1 border-b border-dashed border-slate-300">
                {config.pat || (isAr ? "(فارغ أو لم يتم إدخاله بعد)" : "(Empty or not configured yet)")}
              </div>
              <p className="text-[10px] text-slate-400 font-sans italic">
                {isAr 
                  ? "⚠️ رمز الوصول هذا بمثابة كلمة المرور لحسابك. احتفظ بهذه الورقة في مكان آمن تماماً ولا تشاركها مع أي أحد." 
                  : "⚠️ This PAT serves as your account password. Store this printed sheet in a highly secure place. Never expose it online."}
              </p>
            </div>

          </div>

          {/* Secure instructions */}
          <div className="pt-6 border-t-2 border-slate-200 space-y-3 font-sans text-[11px] text-slate-500 leading-relaxed">
            <p className="font-bold text-slate-800 text-xs">
              {isAr ? "📌 تعليمات الاستخدام والأمان الهامة:" : "📌 Important Usage & Security Instructions:"}
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                {isAr 
                  ? "الاحتفاظ بـ PWA Safeguard مفعل دائماً يحميك من ظهور شريط المتصفح العلوي للتطبيق المثبت (Progressive Web App) أو خسارة ملفات الـ Asset Links الخاصة بأندرويد."
                  : "Keep PWA Safeguard enabled at all times to prevent loose application wrapper structures and browser address bar showing."}
              </li>
              <li>
                {isAr 
                  ? "يمكنك استخدام هذه الورقة المطبوعة لإدخال البيانات يدوياً، أو استخدام ملف النسخة الاحتياطية JSON لاستعادتها تلقائياً."
                  : "Use this printed sheet for reference, or restore all configuration settings instantly with your exported JSON file."}
              </li>
              <li>
                {isAr 
                  ? "تم توليد هذه الوثيقة محلياً 100% وبأمان كامل بمتصفحك."
                  : "This document is generated offline and completely client-side. No credentials are sent to external analytics."}
              </li>
            </ul>
          </div>

        </div>
      </div>


    </div>
  );
}
