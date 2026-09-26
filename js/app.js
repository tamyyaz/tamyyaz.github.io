import { formatBytes, formatDate } from "./format.js";

const LABELS = {
  ar: { download: "تحميل", version: "الإصدار" },
  en: { download: "Download", version: "Version" },
  fr: { download: "Télécharger", version: "Version" },
  de: { download: "Herunterladen", version: "Version" },
  tr: { download: "İndir", version: "Sürüm" },
};

function currentLabels() {
  const lang = (document.documentElement.lang || "ar").toLowerCase();
  return LABELS[lang] || LABELS.en;
}

function buildRow(release) {
  const tr = document.createElement("tr");

  const versionTd = document.createElement("td");
  versionTd.textContent = release.version;

  const dateTd = document.createElement("td");
  dateTd.textContent = formatDate(release.uploadedAt);

  const sizeTd = document.createElement("td");
  sizeTd.textContent = formatBytes(release.sizeBytes);

  const notesTd = document.createElement("td");
  notesTd.textContent = release.notes || "";
  notesTd.className = "notes-cell";

  const downloadTd = document.createElement("td");
  const link = document.createElement("a");
  link.href = release.downloadUrl;
  link.className = "link-btn";
  link.textContent = currentLabels().download;
  downloadTd.appendChild(link);

  tr.append(versionTd, dateTd, sizeTd, notesTd, downloadTd);
  return tr;
}

async function loadReleases() {
  const heroEl = document.getElementById("latest-release");
  const listSection = document.getElementById("release-list-section");
  const tbody = document.querySelector("#release-list tbody");
  const emptyEl = document.getElementById("empty-state");
  const errorEl = document.getElementById("error-state");
  const loadingEl = document.getElementById("loading-state");

  try {
    const res = await fetch("./releases.json", { cache: "no-store" });
    if (!res.ok) throw new Error("fetch-failed");
    const releases = await res.json();
    loadingEl.hidden = true;

    if (!releases.length) {
      emptyEl.hidden = false;
      return;
    }

    const [latest, ...older] = releases;

    heroEl.querySelector(".version").textContent = `${currentLabels().version} ${latest.version}`;
    heroEl.querySelector(".date").textContent = formatDate(latest.uploadedAt);
    heroEl.querySelector(".size").textContent = formatBytes(latest.sizeBytes);
    heroEl.querySelector(".notes").textContent = latest.notes || "";
    heroEl.querySelector(".download-btn").href = latest.downloadUrl;
    heroEl.hidden = false;

    if (older.length > 0) {
      tbody.replaceChildren(...older.map(buildRow));
      listSection.hidden = false;
    }
  } catch (err) {
    console.error("Failed to load releases:", err);
    loadingEl.hidden = true;
    errorEl.hidden = false;
  }
}

loadReleases();
