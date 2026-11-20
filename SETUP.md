# Putting the tracker online

About 20 minutes, all free. You need a Google account. Do the steps in order.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and choose **Create a project**. Call it something like `pharmacy-tracker`. Google Analytics isn't needed.
2. On the project page, click the **Web** icon (`</>`) to add a web app. Give it a name, leave Firebase Hosting unticked, and click **Register app**.
3. Copy the `firebaseConfig` values it shows into `src/config.ts`.

## 2. Turn on logins

1. **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**, then **Google** (pick your email as the support email).
3. Under **Settings → Authorized domains**, add `kwamzmaxing.github.io`.
4. Under **Templates → Password reset**, set the sender name (for example "KASA.Rx") and put your own email as the **Reply-to** address, so replies to reset emails reach you.

## 3. Create the database

1. **Build → Firestore Database → Create database**. Choose **Production mode** and the location `europe-west2 (London)`.
2. Open the **Rules** tab, replace everything with the contents of `firestore.rules` from this repository, and click **Publish**.

## 4. Let people connect Gmail and Calendar

Use the same project in Google Cloud: <https://console.cloud.google.com> (choose your Firebase project at the top).

1. **APIs & Services → Library**: enable **Gmail API**, **Google Calendar API** and **Google Sheets API**.
2. **Google Auth Platform → Branding** (or **OAuth consent screen**): app name "KASA.Rx", your email as support and developer contact, and the site address `https://kwamzmaxing.github.io/pharmacy-service-tracker/` as the home page.
3. **Data access → Add or remove scopes**: add `.../auth/gmail.send`, `.../auth/calendar.events` and `.../auth/drive.file`.
4. **Audience**: leave it in **Testing** for now and add the Gmail addresses of the people who will use it as **Test users** (up to 100).
5. **Clients → Create client → Web application**. Under **Authorized JavaScript origins** add `https://kwamzmaxing.github.io`. Copy the **Client ID** into `googleClientId` in `src/config.ts`.

While the app is in Testing, Google shows people a "Google hasn't verified this app" screen; they click **Continue**. To remove it and allow more than 100 people, choose **Publish app** and complete Google's verification (it asks for a privacy policy page and can take a few weeks).

## 4b. Microsoft: log in, Outlook and Outlook Calendar (optional)

One Microsoft app registration covers all three.

1. Go to **entra.microsoft.com** → **App registrations** → **New registration**.
   - Name: `KASA.Rx`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: platform **Single-page application (SPA)**, `https://kwamzmaxing.github.io/pharmacy-service-tracker/auth-redirect.html`
2. Copy the **Application (client) ID** into `microsoftClientId` in `src/config.ts`.
3. **Authentication** → **Add a platform** → **Web**, redirect URI `https://service-tracker-invoice.firebaseapp.com/__/auth/handler`.
4. **Certificates & secrets** → **New client secret** → copy the secret's **Value** (shown once).
5. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**: `Mail.Send`, `Calendars.ReadWrite`, `User.Read`, `openid`, `email`, `profile`.
6. In Firebase: **Authentication → Sign-in method → Add new provider → Microsoft**, paste the client ID and the secret value, **Save**. Then set `microsoftLogin = true` in `src/config.ts`.

## 5. Publish the site

1. In this GitHub repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Commit the filled-in `src/config.ts` to the `main` branch. The **Publish site** workflow builds and publishes the site to <https://kwamzmaxing.github.io/pharmacy-service-tracker/>.

## 6. Make yourself the admin

1. Open the site, create your account, and copy the **User ID** shown on the **Account** tab.
2. In Firebase: **Firestore Database → Start collection**. Collection ID `admins`; Document ID = your User ID; add one field (`role`, string, `admin`) and save.
3. Reload the site. You'll see the **Admin** tab. Set the name account holders see.

## 7. Invite people

Send them the site link. They create an account (or use **Continue with Google**), then connect Gmail and Calendar from the **Account** tab. If they used the earlier claude.ai version, they can bring their data across with **Account → Your data → Restore from file** using a back-up from that version.

## When the database rules change

New features sometimes need an updated `firestore.rules` (for example, receipt photos for expenses). Open **Firestore Database → Rules** in Firebase, replace everything with the latest `firestore.rules` from this repository, and click **Publish**.

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
