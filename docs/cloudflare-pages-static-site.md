# Cloudflare Pages Static Website Deployment

This repository now contains a static public website at the project root:

- `index.html`
- `style.css`
- `script.js`
- `.nojekyll`
- `_headers`
- `_redirects`
- `404.html`

## Cloudflare Pages Settings

Use these settings for a plain HTML/CSS/JS deployment:

- Build command: `exit 0`
- Build output directory: `/`
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
7. Set build command to `exit 0`.
8. Set output directory to `/`.
9. Deploy.

Future pushes to the selected GitHub branch will automatically redeploy the public site.

## Static Site Note

The root site is fully static and does not expose bot tokens or Discord secrets. Real Discord OAuth session exchange and authenticated guild configuration writes require a backend API bridge or Cloudflare Pages Functions because a static browser app cannot safely store a Discord client secret.

The `_redirects` file blocks common bot source/config paths when deploying the repository root. Keep `.env`, logs, lock files, and `node_modules` out of git; `.gitignore` already excludes them.
