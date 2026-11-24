# Putting the tracker online

About 20 minutes, all free. You need a Google account. Do the steps in order.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and choose **Create a project**. Call it something like `pharmacy-tracker`. Google Analytics isn't needed.
2. On the project page, click the **Web** icon (`</>`) to add a web app. Give it a name, leave Firebase Hosting unticked, and click **Register app**.
3. Copy the `firebaseConfig` values it shows into `src/config.ts`.

## 2. Turn on logins

1. **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**, then **Google** (pick your email as the support email).
3. Under **Settings → Authorized domains**, add `kasarx.co.uk` and `www.kasarx.co.uk` (keep `kwamzmaxing.github.io` until the move is finished).
4. Under **Templates → Password reset**, set the sender name (for example "KASA.Rx") and put your own email as the **Reply-to** address, so replies to reset emails reach you.

## 3. Create the database

1. **Build → Firestore Database → Create database**. Choose **Production mode** and the location `europe-west2 (London)`.
2. Open the **Rules** tab, replace everything with the contents of `firestore.rules` from this repository, and click **Publish**.

## 4. Let people connect Gmail and Calendar

Use the same project in Google Cloud: <https://console.cloud.google.com> (choose your Firebase project at the top).

1. **APIs & Services → Library**: enable **Gmail API**, **Google Calendar API** and **Google Sheets API**.
2. **Google Auth Platform → Branding** (or **OAuth consent screen**): app name "KASA.Rx", your email as support and developer contact, and the site address `https://kwamzmaxing.github.io/pharmacy-service-tracker/` as the home page (`https://kasarx.co.uk/` once the move is finished).
3. **Data access → Add or remove scopes**: add `.../auth/gmail.send`, `.../auth/calendar.events` and `.../auth/drive.file`.
4. **Audience**: leave it in **Testing** for now and add the Gmail addresses of the people who will use it as **Test users** (up to 100).
5. **Clients → Create client → Web application**. Under **Authorized JavaScript origins** add `https://kasarx.co.uk` and `https://www.kasarx.co.uk` (keep `https://kwamzmaxing.github.io` until the move is finished). Copy the **Client ID** into `googleClientId` in `src/config.ts`.

While the app is in Testing, Google shows people a "Google hasn't verified this app" screen; they click **Continue**. To remove it and allow more than 100 people, choose **Publish app** and complete Google's verification (it asks for a privacy policy page and can take a few weeks).

## 5. Publish the site

1. In this GitHub repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Commit the filled-in `src/config.ts` to the `main` branch. The **Publish site** workflow builds and publishes the site to <https://kwamzmaxing.github.io/pharmacy-service-tracker/>.

## 6. Make yourself the admin

1. Open the site, create your account, and copy the **User ID** shown on the **Account** tab.
2. In Firebase: **Firestore Database → Start collection**. Collection ID `admins`; Document ID = your User ID; add one field (`role`, string, `admin`) and save.
3. Reload the site. You'll see the **Admin** tab. Set the name account holders see.

Admin access only works when you log in with **Continue with Google**: the database rules check how you signed in. Logging in with a password gives an ordinary account. Turn on 2-Step Verification (ideally a passkey) for that Google account.

## 7. Invite people

Send them the site link. They create an account (or use **Continue with Google**), then connect Gmail and Calendar from the **Account** tab. If they used the earlier claude.ai version, they can bring their data across with **Account → Your data → Restore from file** using a back-up from that version.

## When the database rules change

New features sometimes need an updated `firestore.rules`. Once the **Publish to kasarx.co.uk** workflow has its key (below), it publishes the rules automatically with every change to `main`. Until then: open **Firestore Database → Rules** in Firebase, replace everything with the latest `firestore.rules` from this repository, and click **Publish**.

## Good to know

- **Maps and distances**: the journey calculator uses free open services: postcodes.io for UK postcodes, OpenStreetMap for place names, OSRM for driving routes and OpenStreetMap map tiles. They need no set-up. If the route service is busy, the tracker falls back to a clearly marked estimate. For heavy use, switch to a paid routing service with your own key.

- **Cost**: Firebase's free plan covers 50,000 reads and 20,000 writes a day, far more than this tracker needs.
- **Privacy**: each person's tracker can only be read by them. The admin sees names, emails, log-in dates, feedback and emails sent through them, never anyone's invoices or passwords.
- **Password resets** are sent by Firebase from `noreply@<your-project>.firebaseapp.com`, with your reply-to address. You can also send a reset link to anyone from the Admin tab.

## Working on the code

```bash
pnpm install
pnpm dev              # the site, using src/config.ts
pnpm emulators        # local Firebase for testing (needs Java)
VITE_USE_EMULATOR=1 pnpm dev   # the site against the local Firebase
```

## Backups

Firestore can back up the whole database on a schedule. Backups are billed by Google Cloud (small for a database this size) and need billing on the project. In the Google Cloud console, open **Cloud Shell** (the `>_` icon) and run:

```bash
gcloud firestore backups schedules create --project=service-tracker-invoice --database='(default)' --recurrence=daily --retention=14d
```

That keeps a daily backup for 14 days. To check it: `gcloud firestore backups schedules list --project=service-tracker-invoice --database='(default)'`. To restore, see Google's "Restore data from a backup" guide for Firestore.

## Crash reports

When something breaks in someone's browser, a short report (error, page, browser, user ID; never tracker data) is saved to the `errors` collection and shown on the Admin tab under **Crash reports**. Clear them once fixed. The rules in `firestore.rules` allow only the admin to read them.

## Tests and rates

`pnpm test` checks the tax, National Insurance, mileage, Making Tax Digital and invoice maths against HMRC's worked examples. The publish workflow runs them before every release. Each April and December a GitHub issue reminds you to check the rates against GOV.UK; update the code, the tests and `RATES_CHECKED` in `src/lib/model.ts` together.


## Publishing to kasarx.co.uk (Firebase Hosting)

The site moves from GitHub Pages to Firebase Hosting on your own domain. GitHub keeps the code; Firebase serves the website from the same Google project as the database.

1. **A key for GitHub to publish with.** In the Google Cloud console for `service-tracker-invoice`: **IAM & Admin → Service accounts → Create service account**, name it `github-publish`, and give it the role **Firebase Admin**. Open it, then **Keys → Add key → Create new key → JSON**. A file downloads.
2. **Give it to GitHub.** In this repository on GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Name: `FIREBASE_SERVICE_ACCOUNT`. Value: paste the whole contents of the downloaded file. Save, then **delete the downloaded file** from your computer.
3. **Publish.** **Actions → Publish to kasarx.co.uk → Run workflow**. When it finishes, the site is on Firebase at `https://service-tracker-invoice.web.app` (and it publishes `firestore.rules` too).
4. **Connect the domain.** Firebase console → **Hosting → Add custom domain**: add `kasarx.co.uk`, then `www.kasarx.co.uk` set to redirect to `kasarx.co.uk`. Firebase shows the DNS records to add (a TXT record to prove ownership and A records). Add exactly those at your domain registrar. The secure certificate is set up automatically; it can take up to a day or so.
5. **Let sign-in work there.** Firebase → **Authentication → Settings → Authorized domains**: add `kasarx.co.uk` and `www.kasarx.co.uk`. Google Cloud → **Google Auth Platform → Clients** → your web client → **Authorized JavaScript origins**: add `https://kasarx.co.uk` and `https://www.kasarx.co.uk`.
6. **Check it.** Open `https://kasarx.co.uk`, log in with email and with Google, and connect Gmail.
7. **Retire the GitHub address.** In this repository: **Settings → Secrets and variables → Actions → Variables → New repository variable**. Name: `MOVED_TO_DOMAIN`, value: `true`. Then **Actions → Publish site (GitHub address) → Run workflow**. The old address now sends people to kasarx.co.uk and the old installed app clears itself. After a few weeks, remove the old address from the authorised domains and JavaScript origins.

People's accounts and records are in the database, so nothing is lost by moving. They log in again on the new address, reinstall the app from it, and set the app lock up again (a passkey belongs to the address it was made on).
