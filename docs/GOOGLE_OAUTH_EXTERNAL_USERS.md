# Allowing External Users for Google OAuth Sign-In

## Problem

When the Google Cloud OAuth consent screen is set to **Internal**, only users
whose email belongs to the same Google Workspace organization can sign in.
External emails (e.g. `lucas@paystack.ch`) will see:

> **Access blocked: The-leadlab can only be used within its organization**
> Error 403: org_internal

No code change can fix this — the setting lives in the Google Cloud Console.

---

## Fix: Switch to External and Publish to Production

### 1. Open the OAuth consent screen

1. Go to <https://console.cloud.google.com/apis/credentials/consent>.
2. Make sure you are in the correct project: **Finance**.
3. Make sure you are signed in as `ali@leadlab.com` (or another project Owner).

### 2. Change User type to External

1. On the **OAuth consent screen** page, find the **User type** section.
2. Click **MAKE EXTERNAL** (or **Edit App** → change from Internal to External).
3. Fill in any required fields (app name, support email, developer contact).
4. Save.

### 3. Publish the app (move out of Testing)

While in **Testing** status, only emails explicitly added as Test Users can
authorize. To allow *any* external email without an allowlist:

1. On the same OAuth consent screen page, look for **Publishing status**.
2. Click **PUBLISH APP**.
3. Confirm the dialog.
4. Status should now read **In production**.

> **Note:** If your app requests sensitive or restricted scopes, Google may
> require a verification review before publishing. For basic `email`, `profile`,
> and `openid` scopes this is typically instant. Calendar/Gmail scopes may
> trigger a review; follow Google's instructions if prompted.

### 4. Verify the Client ID matches your environment

The OAuth client used by Lead Lab must be the same one configured in your
deployment environment variables:

| Env variable                       | Where it's used                |
|------------------------------------|--------------------------------|
| `GOOGLE_CALENDAR_CLIENT_ID`        | Backend `/auth/google/init`    |
| `GOOGLE_CALENDAR_CLIENT_SECRET`    | Backend `/auth/google/callback`|

Confirm these values match the client ID/secret shown at:
<https://console.cloud.google.com/apis/credentials> → OAuth 2.0 Client IDs.

### 5. Verify the Redirect URI

In the same OAuth client settings, the **Authorized redirect URIs** must
include your production callback URL:

```
https://ll-six-lemon.vercel.app/signin/google/callback
```

(Plus any other environments, e.g. `http://localhost:5173/signin/google/callback`
for local development.)

### 6. Test

1. Open an incognito window.
2. Go to <https://ll-six-lemon.vercel.app/signin>.
3. Click **Continue with Google**.
4. Sign in as `lucas@paystack.ch` (or any external email).
5. The sign-in should complete without the `org_internal` error.

---

## Important Notes

- **Internal** means only `@leadlab.com` (or whatever your Workspace domain is)
  can authorize. This is incompatible with any non-Workspace email.
- **External + Testing** means only emails explicitly added as Test Users can
  authorize (limit: 100 users). This is not suitable for production.
- **External + In production** means any Google account can authorize. This is
  the correct setting for allowing users like `lucas@paystack.ch`.

---

## Interim Workaround: Email/Password Invite

If the Google Cloud Console change cannot be made immediately, external users
can still access Lead Lab via email/password:

1. An admin signs into Lead Lab with their existing account.
2. Go to **Settings → Team** (or use the team invitations feature).
3. Click **Invite Member** and enter the external user's email
   (e.g. `lucas@paystack.ch`).
4. The user receives an invitation email with a link to set a password.
5. They accept the invite, create their password, and sign in at `/signin`
   using email + password — no Google OAuth required.

This works because the invitation/registration flow
(`POST /api/v1/team-invitations/accept/{token}`) creates the user with a
password hash and does not touch Google OAuth at all.
