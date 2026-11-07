# Google sign-in for the viewers' polls

Without it, anyone votes anonymously (one vote per browser). With it, only people signed in with Google can vote, once per account.
Nothing is stored about voters except a hash of their Google account number (see `/privacy`).

## Turn it on (about 15 minutes, free)
1. Open https://console.cloud.google.com and create a project (any name, e.g. "Watching Ishai").
2. **Google Auth Platform → Branding** (the consent screen): app name "Watching Ishai", your email as support and developer contact,
   home page `https://ishai.udiabunil.workers.dev`, privacy policy `https://ishai.udiabunil.workers.dev/privacy`. Audience: **External**.
3. **Audience → Publish app** ("In production"). In "Testing" only 100 listed test users can sign in. Sign-in alone uses no sensitive scopes, so Google does not review the app.
4. **Clients → Create client → Web application**. Authorised JavaScript origins: `https://ishai.udiabunil.workers.dev`
   (add any custom domain later). No redirect URIs are needed. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
5. Cloudflare dashboard → Workers → ishai → Settings → Variables and Secrets → Add → type **Secret**, name `GOOGLE_CLIENT_ID`, value the Client ID → Deploy.
   (A secret is kept on every deploy from git; a plain variable set in the dashboard is not.)

Open pages pick it up on their next reload. `/api/health` → `polls.google` shows `true`.
To go back to anonymous voting, delete the `GOOGLE_CLIENT_ID` secret.
