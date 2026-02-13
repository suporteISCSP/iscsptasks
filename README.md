# ISCSP Tasks

Single-page app with:
- Firebase Authentication (email/password)
- Shared Firestore data (all authenticated accounts see the same tasks/lists)
- Tasks tab with status workflow (`To do`, `In progress`, `Unresolved`, `Resolved`)
- Task note box under each task
- Task filtering/sorting by status
- Lists tab with checkboxes, item notes, and checked-state filtering
- Shared cloud persistence + local cache

## 1) Configure Firebase Authentication

1. Create a Firebase project.
2. In Firebase Console -> Authentication -> Sign-in method, enable **Email/Password**.
3. Create user accounts in Firebase Console -> Authentication -> Users.
   The app itself does not provide self-signup.
4. In Authentication -> Settings -> Authorized domains, ensure:
   - `localhost`
   - `<your-username>.github.io`
5. Edit `firebase-config.js` (or copy `firebase-config.sample.js` over it).
6. Fill it with your real Firebase values (`apiKey`, `authDomain`, `projectId`, `appId`).

## 2) Configure Cloud Firestore (Shared Data)

1. In Firebase Console -> Firestore Database, create the database (Production or Test mode).
2. Set rules so all authenticated users can read/write the shared app document:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /shared/globalState {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 3) Run Locally

Serve the folder from a local web server (not `file://`):

```bash
# Option A
npx serve .

# Option B
python -m http.server 8080
```

Then open the served URL in your browser.

## 4) Deploy on GitHub Pages

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
- All authenticated accounts share one common dataset (`shared/globalState`) across devices.
- Header shows sync health (`Sync connected`, `Sync denied`, `Sync timeout`) to diagnose Firestore issues quickly.
