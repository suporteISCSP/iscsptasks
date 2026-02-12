# ISCSP Tasks

Single-page app with:
- Firebase Authentication (email/password)
- Tasks tab with status workflow (`To do`, `In progress`, `Unresolved`, `Resolved`)
- Task note box under each task
- Task filtering/sorting by status
- Lists tab with checkboxes, item notes, and checked-state filtering
- `localStorage` persistence

## 1) Configure Firebase Authentication

1. Create a Firebase project.
2. In Firebase Console -> Authentication -> Sign-in method, enable **Email/Password**.
3. In Authentication -> Settings -> Authorized domains, ensure:
   - `localhost`
   - `<your-username>.github.io`
4. Edit `firebase-config.js` (or copy `firebase-config.sample.js` over it).
5. Fill it with your real Firebase values (`apiKey`, `authDomain`, `projectId`, `appId`).

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
- Authentication is client-side Firebase Auth for UX gating; there is no backend token verification in this project.
