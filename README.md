# KASA.Rx

The operating and financial management platform for pharmacy services, run by KASA.

Log pharmacy services and hours, turn them into invoices, email them from your own Gmail, put payment dates in Google Calendar, and follow up on late payments. Works on any phone or computer.

**Site:** <https://kasarx.co.uk/> (moving from <https://kwamzmaxing.github.io/pharmacy-service-tracker/>; see [SETUP.md](SETUP.md))

## Features

- Accounts with email and password, or Google; password-reset emails; log out and switch user.
- Each person's tracker is private to them and syncs live across their devices.
- Gmail sending with the invoice attached, Google Calendar payment dates, follow-up prompts for overdue invoices.
- Admin tab for the site owner: account holders, reset links, emails sent through the owner's Gmail, feedback, and a Google Sheet of accounts and feedback. Passwords are never stored.
- Excel export, back-up and restore, print or download invoices.

## How it's built

React + TypeScript + Vite + Tailwind, Firebase (Authentication and Firestore) for accounts and data, Google Identity Services for Gmail, Calendar and Sheets. `firestore.rules` holds the access rules. The **Publish site** workflow deploys `main` to GitHub Pages.

```bash
pnpm install
pnpm dev
pnpm build
```
