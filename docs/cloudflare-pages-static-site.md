# Cloudflare Pages Static Website Deployment

This repository now contains a static public website in `public/`:

- `public/index.html`
- `public/style.css`
- `public/script.js`
- `public/.nojekyll`
- `public/_headers`
- `public/_redirects`
- `public/404.html`

## Cloudflare Pages Settings

Use these settings for a plain HTML/CSS/JS deployment:

- Build command: `npm run build`
- Build output directory: `public`
- Root directory: repository root

After Cloudflare connects to the GitHub repository, it will publish a URL like:

```text
https://<project-name>.pages.dev
```

## GitHub To Cloudflare Flow

1. Push this repository to GitHub.
2. Open Cloudflare Dashboard.
3. Go to Workers & Pages.
4. Choose Create application.
5. Choose Pages.
6. Connect the GitHub repository.
7. Set build command to `npm run build`.
8. Set output directory to `public`.
9. Deploy.

## Cloudflare Workers/Wrangler Settings

If you deploy manually with Wrangler, use:

```powershell
npm run deploy:site
```

The included `wrangler.jsonc` points static assets at `./public`, which prevents Wrangler from
uploading the bot source, `node_modules`, SQLite files, logs, or other non-website artifacts.

The root `.assetsignore` is a second safety layer. If Cloudflare or Wrangler ever falls back to
using the repository root as the assets directory, it still excludes bot code, dependencies, logs,
and databases from the upload.

Future pushes to the selected GitHub branch will automatically redeploy the public site.

## Static Site Note

The public site is fully static and does not expose bot tokens or Discord secrets. Real Discord OAuth session exchange and authenticated guild configuration writes require a backend API bridge or Cloudflare Pages Functions because a static browser app cannot safely store a Discord client secret.

The `_redirects` file blocks common bot source/config paths. Keep `.env`, logs, lock files, SQLite databases, and `node_modules` out of git; `.gitignore` already excludes them.
