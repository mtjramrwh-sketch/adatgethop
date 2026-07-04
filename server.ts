import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import AdmZip from "adm-zip";
import crypto from "crypto";
import os from "os";
import { createServer as createViteServer } from "vite";

// Ensure upload directory exists - using system temp folder for robust compatibility with serverless environments (like Vercel)
const UPLOAD_DIR = path.join(os.tmpdir(), "zip-to-github-uploads");
try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Failed to create UPLOAD_DIR locally, falling back to os.tmpdir:", e);
}

// Set up multer disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = fs.existsSync(UPLOAD_DIR) ? UPLOAD_DIR : os.tmpdir();
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + ".zip");
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Upload ZIP file
  app.post("/api/upload", (req, res, next) => {
    upload.single("zipFile")(req, res, (err) => {
      if (err) {
        return res.status(500).json({ error: err.message || "Multer upload error" });
      }
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }
        res.json({
          fileId: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size
        });
      } catch (innerErr: any) {
        res.status(500).json({ error: innerErr.message || "Failed to process upload" });
      }
    });
  });

  // Calculate Git Blob SHA1
  function calculateGitBlobSha(content: Buffer): string {
    const header = `blob ${content.length}\0`;
    const store = Buffer.concat([Buffer.from(header), content]);
    return crypto.createHash("sha1").update(store).digest("hex");
  }

  // API Route: Deploy stream (SSE)
  app.get("/api/deploy-stream", async (req, res) => {
    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Prevent proxy buffering

    const sendLog = (type: "info" | "progress" | "success" | "error" | "warn", message: string, data?: any) => {
      res.write(`data: ${JSON.stringify({ type, message, data })}\n\n`);
    };

    const { fileId, pat, owner, repo, branch, message, subfolder, cleanSync, pwaSafeguard } = req.query;

    if (!fileId || !pat || !owner || !repo) {
      sendLog("error", "Missing required parameters (fileId, GitHub PAT, owner, or repository).");
      return res.end();
    }

    const zipPath = fs.existsSync(path.join(UPLOAD_DIR, fileId as string))
      ? path.join(UPLOAD_DIR, fileId as string)
      : path.join(os.tmpdir(), fileId as string);

    if (!fs.existsSync(zipPath)) {
      sendLog("error", `Uploaded file not found on server (${fileId}). Please try uploading again.`);
      return res.end();
    }

    const targetBranch = (branch as string) || "main";
    const commitMessage = (message as string) || "Update application files via ZIP Deployer";
    const repoSubfolder = (subfolder as string) || ""; // e.g. "src" or ""
    const doCleanSync = cleanSync === "true";
    const isPwaSafeguardActive = pwaSafeguard === "true";

    try {
      sendLog("info", "Reading ZIP file...");
      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();
      
      sendLog("info", `Analyzing ZIP package content: found ${zipEntries.length} entries.`);

      // 1. Process zip entries, extracting valid files
      interface PendingFile {
        path: string; // Repo path (including optional subfolder prefix)
        content: Buffer;
        sha: string; // Computed local Git blob SHA
      }

      const filesToUpload: PendingFile[] = [];

      zipEntries.forEach(entry => {
        // Skip directory entries or OS junk files
        if (entry.isDirectory) return;
        const entryName = entry.entryName;
        
        // Ignore junk/system folders
        if (
          entryName.includes("__MACOSX") || 
          entryName.includes(".DS_Store") ||
          entryName.split("/").includes("node_modules") ||
          entryName.split("/").includes(".git")
        ) {
          return;
        }

        const content = entry.getData();
        const localSha = calculateGitBlobSha(content);

        // Normalize repository path
        // Remove leading/trailing slashes
        let cleanEntryName = entryName;
        if (cleanEntryName.startsWith("./")) {
          cleanEntryName = cleanEntryName.substring(2);
        }
        
        const normalizedRepoPath = repoSubfolder
          ? path.posix.join(repoSubfolder, cleanEntryName)
          : cleanEntryName;

        filesToUpload.push({
          path: normalizedRepoPath,
          content,
          sha: localSha
        });
      });

      sendLog("info", `Identified ${filesToUpload.length} valid source files to check.`);

      if (filesToUpload.length === 0) {
        throw new Error("No valid files found in the ZIP archive.");
      }

      // 2. Fetch remote tree from GitHub to resolve existing SHAs
      sendLog("info", `Connecting to GitHub API for ${owner}/${repo} on branch "${targetBranch}"...`);
      
      const githubHeaders: Record<string, string> = {
        "Authorization": `token ${pat}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Zip-to-Github-PWA-Deployment-Utility"
      };

      // Find the latest commit SHA of the target branch to get its tree
      let commitSha = "";
      let isRepositoryEmpty = false;

      try {
        const refResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${targetBranch}`, {
          headers: githubHeaders
        });
        
        if (!refResponse.ok) {
          const rawErrorBody = await refResponse.text();
          let is409ConflictEmpty = false;
          
          try {
            const parsed = JSON.parse(rawErrorBody);
            if (refResponse.status === 409 && parsed.message && parsed.message.toLowerCase().includes("empty")) {
              is409ConflictEmpty = true;
            }
          } catch (e) {
            if (refResponse.status === 409 && rawErrorBody.toLowerCase().includes("empty")) {
              is409ConflictEmpty = true;
            }
          }

          if (refResponse.status === 404 || is409ConflictEmpty) {
            sendLog("info", `Branch fetch returned ${refResponse.status}. Checking if repository is empty...`);
            
            const branchesResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, {
              headers: githubHeaders
            });
            
            let isRepoEmpty = false;
            if (branchesResponse.ok) {
              const branchesData = await branchesResponse.json() as any[];
              if (Array.isArray(branchesData) && branchesData.length === 0) {
                isRepoEmpty = true;
              }
            } else if (branchesResponse.status === 404 || branchesResponse.status === 409) {
              isRepoEmpty = true;
            }

            if (isRepoEmpty || is409ConflictEmpty) {
              isRepositoryEmpty = true;
              sendLog("info", `Detected completely empty repository. Will initialize repository and create branch "${targetBranch}" during file uploads.`);
            }
          }

          if (!isRepositoryEmpty) {
            throw new Error(`Failed to fetch branch reference (HTTP ${refResponse.status}): ${refResponse.statusText}. Details: ${rawErrorBody}`);
          }
        } else {
          const refData = await refResponse.json() as any;
          commitSha = refData.object.sha;
          sendLog("info", `Latest commit on branch "${targetBranch}" is ${commitSha.slice(0, 7)}.`);
        }
      } catch (err: any) {
        if (!isRepositoryEmpty) {
          throw new Error(`Could not access branch "${targetBranch}": ${err.message}`);
        }
      }

      const remoteFilesMap = new Map<string, string>(); // path -> sha
      
      if (!isRepositoryEmpty && commitSha) {
        // Fetch the recursive git tree
        sendLog("info", "Fetching remote repository file list...");
        const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=true`, {
          headers: githubHeaders
        });

        if (!treeResponse.ok) {
          throw new Error(`Failed to fetch Git Tree: ${treeResponse.statusText}`);
        }

        const treeData = await treeResponse.json() as any;
        
        if (treeData && Array.isArray(treeData.tree)) {
          treeData.tree.forEach((item: any) => {
            if (item.type === "blob") {
              remoteFilesMap.set(item.path, item.sha);
            }
          });
        }

        sendLog("info", `Remote repository currently has ${remoteFilesMap.size} files.`);
      } else {
        sendLog("info", "Skipping remote tree fetch. Proceeding to upload all files to newly initialized repository.");
      }

      // 3. Compare and Upload sequentially
      let uploadCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const remoteSha = remoteFilesMap.get(file.path);

        // If remote file exists and has the same Git blob SHA, skip it!
        if (remoteSha === file.sha) {
          skipCount++;
          sendLog("progress", `[SKIPPED] ${file.path} (no changes detected)`);
          continue;
        }

        // Prepare base64 upload
        const base64Content = file.content.toString("base64");
        const payload: Record<string, any> = {
          message: `${commitMessage}\n\n[Uploaded via Deployment Web Tool]`,
          content: base64Content,
          branch: targetBranch
        };

        if (remoteSha) {
          payload.sha = remoteSha;
        }

        sendLog("progress", `[UPLOADING] ${file.path} (${i + 1}/${filesToUpload.length})...`);

        try {
          const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
          const uploadUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
          const uploadResponse = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              ...githubHeaders,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });

          if (!uploadResponse.ok) {
            const errBody = await uploadResponse.text();
            throw new Error(`Status ${uploadResponse.status}: ${errBody}`);
          }

          uploadCount++;
          sendLog("progress", `[SUCCESS] Committed: ${file.path}`);
        } catch (uploadErr: any) {
          errorCount++;
          sendLog("warn", `[FAILED] File "${file.path}": ${uploadErr.message}`);
          // We can choose to halt or continue. Usually we should halt if it's a fatal token issue,
          // but if it's a single file we can log it. Let's halt if there are consecutive failures.
          if (errorCount > 3) {
            throw new Error("Too many consecutive file upload failures. Deployment aborted.");
          }
        }

        // Add small throttling delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // 4. Optional: Clean Sync (Delete files in repo subfolder that are NOT in the ZIP)
      let deleteCount = 0;
      if (doCleanSync) {
        sendLog("info", "Starting full clean sync comparison...");
        const localPathsSet = new Set(filesToUpload.map(f => f.path));

        // Find orphan files in remote repo that:
        // - Are in the specified subfolder (if subfolder filter is set)
        // - Do NOT exist in our uploaded ZIP list
        const orphansToDelete: { path: string; sha: string }[] = [];
        remoteFilesMap.forEach((sha, remotePath) => {
          // If subfolder is specified, only clean items inside that subfolder
          if (repoSubfolder && !remotePath.startsWith(repoSubfolder + "/")) {
            return;
          }
          if (!localPathsSet.has(remotePath)) {
            // Apply PWA/standalone display safeguard protection if active
            if (isPwaSafeguardActive) {
              const lowerPath = remotePath.toLowerCase();
              const fileName = lowerPath.split("/").pop() || "";
              
              const isProtected = 
                fileName === "manifest.json" ||
                fileName === "manifest.webmanifest" ||
                fileName === "site.webmanifest" ||
                fileName === "sw.js" ||
                fileName === "service-worker.js" ||
                fileName.includes("apple-touch-icon") ||
                lowerPath.includes(".well-known/assetlinks.json") ||
                lowerPath.includes(".well-known/apple-app-site-association");

              if (isProtected) {
                sendLog("info", `[SAFEGUARD PROTECTED] Skipped deletion of PWA/Standalone configuration file: ${remotePath}`);
                return;
              }
            }
            orphansToDelete.push({ path: remotePath, sha });
          }
        });

        if (orphansToDelete.length > 0) {
          sendLog("info", `Found ${orphansToDelete.length} orphan files in repo to clean up.`);
          for (let i = 0; i < orphansToDelete.length; i++) {
            const orphan = orphansToDelete[i];
            sendLog("progress", `[DELETING] Orphan file: ${orphan.path} (${i + 1}/${orphansToDelete.length})...`);

            try {
              const encodedOrphanPath = orphan.path.split("/").map(encodeURIComponent).join("/");
              const deleteResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedOrphanPath}`, {
                method: "DELETE",
                headers: {
                  ...githubHeaders,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  message: `Delete orphan file: ${orphan.path} (Sync)`,
                  sha: orphan.sha,
                  branch: targetBranch
                })
              });

              if (!deleteResponse.ok) {
                const errBody = await deleteResponse.text();
                throw new Error(`Status ${deleteResponse.status}: ${errBody}`);
              }

              deleteCount++;
              sendLog("progress", `[DELETED] Sync: ${orphan.path}`);
            } catch (delErr: any) {
              sendLog("warn", `[SKIP DELETE FAILED] ${orphan.path}: ${delErr.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        } else {
          sendLog("info", "No orphan files to delete. Repository is clean.");
        }
      }

      // 5. Clean up local zip file
      try {
        fs.unlinkSync(zipPath);
      } catch (err) {
        console.warn("Could not delete temp ZIP file", err);
      }

      // 6. Success finalize
      sendLog("success", "Deployment operation completed successfully! 🎉", {
        stats: {
          totalChecked: filesToUpload.length,
          uploaded: uploadCount,
          skipped: skipCount,
          deleted: deleteCount,
          failed: errorCount
        }
      });

    } catch (err: any) {
      sendLog("error", `Deployment failed: ${err.message}`);
    } finally {
      res.end();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global error handler middleware to ensure we ALWAYS return JSON
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global Error Handler caught an error:", err);
    res.status(500).json({
      error: err.message || "Internal Server Error",
      success: false
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
