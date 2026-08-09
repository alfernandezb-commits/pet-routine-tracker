# Pet Routine Tracker

A lightweight, real-time web app built to pair with an NFC tag: scan it, and
the page opens straight to today's feeding and medication schedule. Anyone
in the household can mark a task done, and it syncs instantly across every
device.

## Features

- **Today view** — today's tasks with a large tap-to-complete toggle for
  each one.
- **Manage view** — add, edit, and delete tasks. Each one has a name, a
  scheduled time, and an icon: pill, syrup bottle, or food bowl.
- **Dark mode** — toggle in the header; the preference is saved per device
  and defaults to the system setting.
- **Daily reset** — completed tasks automatically reset at the start of a
  new day.

## Tech stack

Plain HTML/CSS/JS, no build step, with Firebase Firestore for real-time
sync across devices.

## Setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com/).
2. Enable **Firestore Database** (production mode).
3. Under **Project settings → General**, add a web app and copy the
   generated `firebaseConfig` values into the `window.FIREBASE_CONFIG`
   block at the bottom of `index.html`.
4. In **Firestore Database → Rules**, use:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /tasks/{taskId} {
         allow read, write: if true;
       }
       match /meta/{docId} {
         allow read, write: if true;
       }
     }
   }
   ```

   These rules leave the database open to anyone with the project's API
   key, since the app has no login. That's a reasonable tradeoff for a
   private household tool shared over a single NFC tag, but not for
   anything sensitive — add Firebase Auth if you need real access control.

5. Deploy `index.html`, `styles.css`, and `app.js` as a static site — for
   example with GitHub Pages (**Settings → Pages → Deploy from branch**) —
   and point your NFC tag at the resulting URL.

Without a Firebase config, the app still loads and the UI (view switching,
dark mode) still works, but tasks can't be saved or synced — a banner in
the app will say so until it's configured.
