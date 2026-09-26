const UNIT_LABELS = {
  ar: ["بايت", "كيلوبايت", "ميغابايت", "غيغابايت"],
  en: ["B", "KB", "MB", "GB"],
  fr: ["o", "Ko", "Mo", "Go"],
  de: ["B", "KB", "MB", "GB"],
  tr: ["B", "KB", "MB", "GB"],
};

function currentLang() {
  const lang = (document.documentElement.lang || "ar").toLowerCase();
  return UNIT_LABELS[lang] ? lang : "en";
}

export function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return "";
  const units = UNIT_LABELS[currentLang()];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString(currentLang(), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
