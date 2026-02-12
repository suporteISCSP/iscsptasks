# ISCSP Tasks

Single-page app with:
- Keycloak login button + redirect-based authentication
- Tasks tab with status workflow (`To do`, `In progress`, `Unresolved`, `Resolved`)
- Task note box under each task
- Task filtering/sorting by status
- Lists tab with checkboxes, item notes, and checked-state filtering
- `localStorage` persistence

## 1) Configure Keycloak

1. Copy `keycloak-config.sample.js` to `keycloak-config.js`.
2. Fill in your Keycloak values:
   - `url`
   - `realm`
   - `clientId`
3. In Keycloak client settings, add valid redirect URIs:
   - Local dev: `http://localhost:8080/*`
   - GitHub Pages: `https://<your-username>.github.io/<your-repo>/*`
4. Add web origins:
   - `http://localhost:8080`
   - `https://<your-username>.github.io`

## 2) Run Locally

Serve the folder from a local web server (not `file://`):

```bash
# Option A
npx serve .

# Option B
python -m http.server 8080
```

Then open the served URL in your browser.

## 3) Deploy on GitHub Pages

This repository includes `.github/workflows/deploy-pages.yml` for zero-build static deploy.

1. Push to your `main` branch.
2. In GitHub repo settings, open `Pages`.
3. Set source to `GitHub Actions`.
4. Wait for the `Deploy GitHub Pages` workflow to finish.
5. Open:
   - `https://<your-username>.github.io/<your-repo>/`

## Notes

- Task default status is always **To do** on creation.
- Status colors:
  - `To do` = gray
  - `Resolved` = green
  - `Unresolved` = red
  - `In progress` = yellow
