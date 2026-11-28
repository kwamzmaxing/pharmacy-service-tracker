# KASA.Rx: owner's to-do list

Last updated 25 November 2026. Tick items off as you go.

## Done
- [x] Publish `firestore.rules` (now published automatically with every update)
- [x] Billing on, daily back-ups (kept 14 days), £1 budget alert
- [x] 2-Step Verification on KASA.Scripts@gmail.com
- [x] Buy kasarx.co.uk and point it at Firebase Hosting
- [x] Sign-in allowed on kasarx.co.uk (email and Google both work)

## 1. Finish the move to kasarx.co.uk (this week)
- [ ] Check `www.kasarx.co.uk` is added in Firebase Hosting and redirects to kasarx.co.uk
- [ ] On kasarx.co.uk: reconnect Gmail and Google Calendar in Settings, reinstall the app on your phone, and set up the app lock again
- [ ] Retire the GitHub address: GitHub → Settings → Secrets and variables → Actions → Variables → add `MOVED_TO_DOMAIN` = `true`, then Actions → "Publish site (GitHub address)" → Run workflow
- [ ] A few weeks later: remove `kwamzmaxing.github.io` from Firebase authorised domains and the Google client's JavaScript origins

## 2. Legal basics (this week)
- [ ] Register with the ICO and pay the data protection fee (£52 or £78 for most small businesses, per GOV.UK)
- [ ] Accept Google Cloud's data processing terms (Google Cloud console → IAM & Admin → Settings / Privacy & Security)
- [ ] Note your Firestore region (Firebase → Firestore Database, shown at the top)
- [ ] Send Claude: legal or trading name, a postal address, ICO registration number and Firestore region, for the privacy policy

## 3. Google sign-in and Gmail for everyone (Google verification)
- [ ] Prove you own kasarx.co.uk in Google Search Console (add the TXT record it gives you at GoDaddy)
- [ ] Consent screen (Google Auth Platform → Branding): name KASA.Rx, logo, support email, home page `https://kasarx.co.uk/`, privacy policy `https://kasarx.co.uk/privacy.html`, terms of use (Claude to write the page), authorised domain `kasarx.co.uk`
- [ ] Reasons for each permission: Gmail send, Calendar events, Drive files (Claude to write)
- [ ] Record the demo video from Claude's script and upload it to YouTube as unlisted
- [ ] Switch Publishing status to "In production" and submit for verification (allow a few days to a few weeks)
- [ ] Meanwhile, add beta testers' Gmail addresses as test users

## 4. Documents (next 2–4 weeks; Claude drafts, you check)
- [ ] Terms of use
- [ ] Record of processing
- [ ] Data protection impact assessment (DPIA)
- [ ] Breach plan (the ICO must be told within 72 hours when a breach is reportable)
- [ ] Data-sharing agreement with accountants you refer people to

## 5. Before charging users
- [ ] Decide pricing (suggested: free plan plus a paid plan; no ads)
- [ ] Solicitor review: privacy policy, terms, accountant agreement (and the Open Banking provider, if adding the bank link)
- [ ] Move the business email to Google Workspace
- [ ] Optional: Cyber Essentials
- [ ] Ongoing: delete accountant-request emails older than 12 months from KASA.Scripts@gmail.com (the privacy policy promises this)

## 6. Future features
- [x] Google Calendar sync from any page, not just Shifts
- [x] Accounting: monthly outgoings by category, smarter split, 5-star balance score and cut-back ideas
- [x] Getting to shifts: drive time, leave-by time, Google Maps / Waze / Apple Maps (public transport uses your own journey time)
- [ ] Bank statement upload: match payments to invoices and mark them paid (no regulation needed)
- [ ] Live bank link through an FCA-authorised Open Banking provider (needs a small server)
- [ ] Always-on calendar sync without signing in to Google every hour (same server as the bank link)

## Notes
- **Travel times:** driving estimates come from free routing (OSRM) with no live traffic; public transport has no free UK-wide source, so it uses the journey time you type and opens live times in Google Maps or Apple Maps. Live traffic or public transport estimates in the app would need Google's paid Routes API.
- **Shift sync to Google Calendar:** about 1 second after saving, from any page, when sync is on and Calendar is connected in this visit (Google's permission lasts about an hour). When the permission has run out, changes queue up and Home shows "N shift changes waiting to go into Google Calendar" with an Update calendar button. Shifts ending more than 30 days ago aren't synced.
- **Google Cloud credit:** £225.52 free trial credit, valid until 17 February 2027; unused credit expires. Charges after that go to your card; the £1 alert warns you.

## Rough costs
- Must-dos: about £60–£100 in year one (ICO fee confirmed; the rest is estimated)
- With solicitor review and Workspace: about £650–£2,200; with Cyber Essentials, about £1,000–£2,600 (estimates; get quotes)
- From year two: about £150–£200 a year, plus the domain renewal (check GoDaddy's renewal price)
