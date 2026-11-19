# Pharmacy Service Tracker

Log pharmacy services and hours, turn them into invoices, email them from Gmail, and follow up on late payments. Published as a claude.ai artifact.

## Features

- Tracker accounts (email + password). Each account's data is encrypted with its own key, unlocked by the password.
- Admin tab for the page owner: account holders, password-reset codes sent from the owner's Gmail, emails queued through the owner's Gmail, feedback, and a Google Sheet export. Passwords are never stored.
- Gmail sending and drafts, Google Calendar payment dates, Excel export, back-up and restore.

## Build

```bash
pnpm install
bash ~/.claude/skills/web-artifacts-builder/scripts/bundle-artifact.sh
node finish-artifact.mjs
```

`artifact.html` is the page that gets published. `src/lib` holds the data model, encryption, storage and connector code; `src/app` holds the screens.
