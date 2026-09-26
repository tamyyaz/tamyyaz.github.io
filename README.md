# تميّز — Tamyyaz website

The public website for the [Tamyyaz](https://github.com) Android app: a
download page for the latest signed APK build (distributed directly,
outside the Play Store), a bilingual privacy policy (Arabic + English),
and a password-protected `/admin` page for publishing new releases. No
server, no database, no paid hosting:

- **Hosting** → GitHub Pages (`.github/workflows/pages.yml` deploys this
  repo on every push to `main`), reached through GitHub's global CDN.
- **File storage** → each APK is committed straight into the repo under
  `releases/`, via the GitHub Contents API, then served like any other
  static file by Pages itself. (GitHub Releases would be the more
  conventional place for this, but its asset-upload endpoint
  (`uploads.github.com`) doesn't send CORS headers, so a browser can't
  upload to it directly — every attempt fails as an opaque network error.
  Committing the file is the CORS-friendly equivalent, since it stays on
  `api.github.com`.) Trade-off: every publish permanently grows the repo —
  fine for a personal project, but nothing prunes old APKs automatically.
- **The "database"** → [`releases.json`](releases.json) at the repo root, a
  small manifest the admin panel rewrites on every publish/delete. The
  public page just fetches that file — no backend, no rate limits.
- **Admin auth** → a GitHub Personal Access Token, entered once in the
  browser. No separate login system to build or maintain.

## Pages

- `index.html` — the download page (Arabic, at the site root). Shows the
  latest release front and center, with an archive of older versions
  below it. Translated copies: `index-en.html`, `index-fr.html`,
  `index-de.html`, `index-tr.html`.
- `privacy.html` — the privacy policy (Arabic, at the site root).
  Translated copies: `privacy-en.html` (the authoritative version in
  case translations conflict), `privacy-fr.html`, `privacy-de.html`,
  `privacy-tr.html`.
- Every page carries a 5-way language switcher (AR/EN/FR/DE/TR) in the
  header nav. There's no build step or shared template — each language
  is its own plain HTML file, so a copy change (wording, contact email,
  a new section) has to be repeated across all 5 files by hand.
- `js/format.js` and `js/app.js` pick their date/byte-unit formatting and
  a couple of UI labels ("Download", "Version") from the page's
  `<html lang="...">` attribute, so a new release only needs to be
  published once in `releases.json` — every language page renders it
  correctly on its own.
- `admin/` — the release-publishing dashboard (not linked from the public
  pages, disallowed in `robots.txt`), Arabic-only since it's an internal
  tool.

## One-time setup

1. **Enable GitHub Pages** on this repo: Settings → Pages → Source:
   "GitHub Actions" (the existing workflow at
   `.github/workflows/pages.yml` handles the rest, deploying on every
   push to `main`). The site goes live at:
   - `https://<you>.github.io/<repo>/` for a normal repo, or
   - `https://<you>.github.io/` if the repo is named exactly
     `<you>.github.io` (a GitHub "user site" — the closest thing to a
     clean free domain GitHub offers; still a `github.io` subdomain, not
     a real custom domain).
2. **Fill in [`admin/config.js`](admin/config.js)** with this repo's
   owner and name (already set for this repo).
3. **Create your admin token**:
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
   → "Fine-grained token" → Repository access: **only this one repo** →
   Permissions → Contents: **Read and write**. Nothing broader — a
   fine-grained token scoped to one repo means that if it ever leaks, the
   damage is contained to this repo, not your whole account.
4. Open `/admin`, paste the token in. It's stored only in your browser
   (localStorage if "remember" is checked, sessionStorage otherwise) and
   sent only to `api.github.com` directly from the browser — it never
   touches any third-party server. Treat it like a password: if you ever
   suspect it leaked, revoke it from the GitHub settings page above.

### Custom domain later (optional, not free)

GitHub Pages supports a real custom domain if you ever buy one: repo →
Settings → Pages → "Add a custom domain", then add the DNS records it
shows you at your registrar (an `A`/`ALIAS` record for an apex domain, or
a `CNAME` record for a subdomain). GitHub issues the SSL certificate
automatically once DNS resolves.

## Local preview

Plain static files — any local server works, e.g.:

```bash
npx serve .
```

Open `/admin` and try publishing against a real (ideally disposable/test)
repo you control — the admin → GitHub write path is built against GitHub's
documented REST API.

## How a release is structured

Each entry in `releases.json` looks like:

```json
{
  "version": "1.2.0",
  "notes": "What changed in this release",
  "fileName": "tamyyaz-1.2.0.apk",
  "sizeBytes": 24117248,
  "uploadedAt": "2026-09-20T18:04:00.000Z",
  "downloadUrl": "releases/1758392400000-tamyyaz-1.2.0.apk",
  "path": "releases/1758392400000-tamyyaz-1.2.0.apk",
  "blobSha": "a1b2c3d4e5f6..."
}
```

`downloadUrl` is a path relative to the site root, so it resolves correctly
whether the site lives at the domain root or under `/<repo>/`. The array is
kept newest-first (the admin panel prepends on publish), so "latest" always
means "most recently published," not the highest version number — publish
in order. Deleting a release removes the committed APK file (using
`blobSha`, refetched if missing) and its `releases.json` entry — the file
still exists in old git history/commits, same as any other git-tracked file
would, it's just no longer referenced by the manifest or in the current
tree.
