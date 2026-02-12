# ISCSP Tasks

Single-page app with:
- Google account login (Google Identity Services)
- Tasks tab with status workflow (`To do`, `In progress`, `Unresolved`, `Resolved`)
- Task note box under each task
- Task filtering/sorting by status
- Lists tab with checkboxes, item notes, and checked-state filtering
- `localStorage` persistence

## 1) Configure Google Sign-In

1. In Google Cloud Console, create an OAuth client of type **Web application**.
2. Add Authorized JavaScript origins:
   - `http://localhost:8080`
   - `https://<your-username>.github.io`
3. Copy `google-config.sample.js` to `google-config.js`.
4. Set your OAuth Client ID in `google-config.js`.

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
- Authentication is client-side Google sign-in for UX gating; there is no backend token verification in this project.
