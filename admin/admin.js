import { githubConfig } from "./config.js";
import { formatBytes, formatDate } from "../js/format.js";

const API_BASE = "https://api.github.com";
const TOKEN_KEY = "tamyyaz_admin_token";
const MAX_FILE_BYTES = 100 * 1024 * 1024; // GitHub Contents API ceiling
const repoFullName = `${githubConfig.owner}/${githubConfig.repo}`;

const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const rememberCheckbox = document.getElementById("remember-token");
const logoutBtn = document.getElementById("logout-btn");
const repoHint = document.getElementById("repo-hint");
const repoLabel = document.getElementById("repo-label");
const uploadForm = document.getElementById("upload-form");
const uploadBtn = document.getElementById("upload-btn");
const uploadProgress = document.getElementById("upload-progress");
const progressBar = uploadProgress.querySelector(".progress-bar");
const uploadStatus = document.getElementById("upload-status");
const releaseTbody = document.querySelector("#admin-release-list tbody");

repoHint.textContent = repoFullName;
repoLabel.textContent = repoFullName;

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function setToken(token, remember) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function verifyToken(token) {
  const res = await fetch(`${API_BASE}/repos/${repoFullName}`, {
    headers: ghHeaders(token),
  });
  if (!res.ok) throw new Error("invalid-token-or-repo");
  const data = await res.json();
  if (!data.permissions || !data.permissions.push) throw new Error("no-write-access");
}

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  loadReleases();
}

async function init() {
  const token = getToken();
  if (!token) {
    showLogin();
    return;
  }
  try {
    await verifyToken(token);
    showDashboard();
  } catch {
    clearToken();
    showLogin();
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const token = document.getElementById("token-input").value.trim();
  if (!token) return;
  try {
    await verifyToken(token);
    setToken(token, rememberCheckbox.checked);
    loginForm.reset();
    showDashboard();
  } catch (err) {
    loginError.textContent = "التوكن غير صالح أو لا يملك صلاحية الكتابة على هذا المستودع.";
    loginError.hidden = false;
  }
});

logoutBtn.addEventListener("click", () => {
  clearToken();
  showLogin();
});

// --- releases.json manifest helpers (committed straight to the repo) ---

function decodeBase64(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000; // avoid call-stack blowups from spreading huge arrays
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchManifest() {
  const res = await fetch(`${API_BASE}/repos/${repoFullName}/contents/releases.json`, {
    headers: ghHeaders(getToken()),
    cache: "no-store",
  });
  if (res.status === 404) return { sha: null, releases: [] };
  if (!res.ok) throw new Error("تعذّر قراءة releases.json من المستودع.");
  const data = await res.json();
  return { sha: data.sha, releases: JSON.parse(decodeBase64(data.content)) };
}

async function writeManifest(releases, sha, message) {
  const res = await fetch(`${API_BASE}/repos/${repoFullName}/contents/releases.json`, {
    method: "PUT",
    headers: { ...ghHeaders(getToken()), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: encodeBase64(JSON.stringify(releases, null, 2)),
      sha: sha || undefined,
    }),
  });
  if (!res.ok) throw new Error("تعذّر تحديث releases.json.");
}

// --- upload: commit the APK straight into the repo via the Contents API ---
//
// GitHub Releases' asset-upload endpoint (uploads.github.com) doesn't send
// CORS headers, so a browser can't POST a file to it directly — every such
// request fails as an opaque network error, no matter the token or repo.
// api.github.com (Contents API, used here and for releases.json above) does
// support CORS, so the APK is committed as a normal repo file under
// releases/ instead, and GitHub Pages serves it like any other static file.

function putFileWithProgress(path, base64Content, message, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${API_BASE}/repos/${repoFullName}/contents/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/vnd.github+json");
    xhr.setRequestHeader("X-GitHub-Api-Version", "2022-11-28");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let msg = "فشل رفع ملف APK إلى المستودع.";
        try {
          const err = JSON.parse(xhr.responseText);
          if (err.message) msg = err.message;
        } catch {
          // keep default msg
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("فشل رفع ملف APK — تحقق من الاتصال."));
    xhr.send(JSON.stringify({ message, content: base64Content }));
  });
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById("apk-file");
  const version = document.getElementById("version-input").value.trim();
  const notes = document.getElementById("notes-input").value.trim();
  const file = fileInput.files[0];
  const token = getToken();

  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".apk")) {
    showUploadStatus("الملف يجب أن يكون بصيغة APK.", false);
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showUploadStatus("حجم الملف أكبر من 100 ميغابايت (حد GitHub لهذا النوع من الرفع).", false);
    return;
  }

  uploadBtn.disabled = true;
  uploadProgress.hidden = false;
  progressBar.style.width = "0%";
  showUploadStatus("جارٍ تجهيز الملف...", null);

  try {
    const base64 = await fileToBase64(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `releases/${Date.now()}-${safeName}`;

    showUploadStatus("جارٍ رفع ملف APK إلى GitHub...", null);
    const uploadResult = await putFileWithProgress(
      path,
      base64,
      `Publish release ${version}`,
      token,
      (pct) => {
        progressBar.style.width = `${pct}%`;
      }
    );

    showUploadStatus("جارٍ تحديث قائمة الإصدارات...", null);
    const { sha, releases } = await fetchManifest();
    releases.unshift({
      version,
      notes,
      fileName: file.name,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
      downloadUrl: path,
      path,
      blobSha: uploadResult.content.sha,
    });
    await writeManifest(releases, sha, `Publish release ${version}`);

    showUploadStatus("تم نشر الإصدار بنجاح.", true);
    uploadForm.reset();
    uploadProgress.hidden = true;
    loadReleases();
  } catch (err) {
    console.error(err);
    showUploadStatus(err.message || "حدث خطأ أثناء النشر.", false);
  } finally {
    uploadBtn.disabled = false;
  }
});

function showUploadStatus(text, success) {
  uploadStatus.hidden = false;
  uploadStatus.textContent = text;
  uploadStatus.className =
    success === true ? "status-text success" : success === false ? "status-text error-text" : "status-text";
}

// --- list + delete ---

async function loadReleases() {
  const { releases } = await fetchManifest();
  if (releases.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "empty-row";
    td.textContent = "ما في إصدارات منشورة بعد — أول رفع رح يظهر هون.";
    tr.appendChild(td);
    releaseTbody.replaceChildren(tr);
    return;
  }
  releaseTbody.replaceChildren(...releases.map(buildAdminRow));
}

function buildAdminRow(release) {
  const tr = document.createElement("tr");

  const versionTd = document.createElement("td");
  versionTd.textContent = release.version;

  const dateTd = document.createElement("td");
  dateTd.textContent = formatDate(release.uploadedAt);

  const sizeTd = document.createElement("td");
  sizeTd.textContent = formatBytes(release.sizeBytes);

  const actionTd = document.createElement("td");
  const delBtn = document.createElement("button");
  delBtn.textContent = "حذف";
  delBtn.className = "delete-btn";
  delBtn.addEventListener("click", () => deleteRelease(release));
  actionTd.appendChild(delBtn);

  tr.append(versionTd, dateTd, sizeTd, actionTd);
  return tr;
}

async function deleteRelease(release) {
  if (!confirm(`حذف الإصدار ${release.version}؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
  const token = getToken();
  try {
    if (release.path) {
      let sha = release.blobSha;
      if (!sha) {
        const res = await fetch(`${API_BASE}/repos/${repoFullName}/contents/${release.path}`, {
          headers: ghHeaders(token),
        });
        if (res.ok) sha = (await res.json()).sha;
      }
      if (sha) {
        await fetch(`${API_BASE}/repos/${repoFullName}/contents/${release.path}`, {
          method: "DELETE",
          headers: { ...ghHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Remove release ${release.version}`, sha }),
        });
      }
    }
    const { sha: manifestSha, releases } = await fetchManifest();
    const updated = releases.filter((r) => r.path !== release.path);
    await writeManifest(updated, manifestSha, `Remove release ${release.version}`);
    loadReleases();
  } catch (err) {
    console.error(err);
    alert("تعذّر حذف الإصدار بالكامل — تحقق من GitHub يدوياً.");
  }
}

init();
