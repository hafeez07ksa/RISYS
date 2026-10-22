# Auth emails from no-reply@risysgrc.com

RISYS sends two kinds of email:

| Email | Sent by | From |
|---|---|---|
| Workspace invitations, activation links, notifications | `send-email` edge function → Resend API | `no-reply@risysgrc.com` (already correct) |
| **Confirm your email**, **Reset password**, invite, magic link, email change | **Supabase Auth itself** | Supabase's own mail server, **unless custom SMTP is set** |

After a company is provisioned, the new admin opens the activation link and creates a password. Supabase Auth then sends a "Confirm your email" message. That message, and every password-reset email, comes from Supabase until the project uses custom SMTP. Fixing it is a project setting, not code.

The branded templates are in this repo at `public/email/templates/` and use the same layout as the invitation emails.

---

## Tokyo (Supabase Cloud) — do this now

### 1. SMTP → Resend
Dashboard → **Authentication → Emails → SMTP Settings** → *Enable custom SMTP*

| Field | Value |
|---|---|
| Sender email | `no-reply@risysgrc.com` |
| Sender name | `RISYS` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | a Resend API key (create a dedicated one in Resend: *API Keys → Create*, permission **Sending access**, name `supabase-auth-tokyo`) |
| Minimum interval between emails | leave the default |

Save. The `risysgrc.com` domain is already verified in Resend (DKIM on `resend._domainkey`), so nothing changes in DNS.

### 2. Templates
Dashboard → **Authentication → Emails → Templates**. For each one, set the subject and paste the whole HTML file:

| Template | Subject | File |
|---|---|---|
| Confirm signup | `Confirm your email for RISYS` | `public/email/templates/confirmation.html` |
| Reset password | `Reset your RISYS password` | `public/email/templates/recovery.html` |
| Invite user | `You have been invited to RISYS` | `public/email/templates/invite.html` |
| Magic link | `Your RISYS sign-in link` | `public/email/templates/magic_link.html` |
| Change email address | `Confirm your new email for RISYS` | `public/email/templates/email_change.html` |

The logo loads from `{{ .SiteURL }}/email/risys-mark-light.png`, so the Site URL in step 3 must be the app.

### 3. URL configuration
Dashboard → **Authentication → URL Configuration**

- Site URL: `https://app.risysgrc.com`
- Redirect URLs, which must include:
  - `https://app.risysgrc.com/**`
  - `http://localhost:5173/**` (local development)

The reset link sends people to `/reset-password`. If that address is not allowed, Supabase falls back to the Site URL. The app also catches that case and moves the user to `/reset-password`.

### 4. Test
1. Open `/forgot-password`, enter your email, and check that the message arrives from **RISYS &lt;no-reply@risysgrc.com&gt;** with the RISYS layout.
2. Open the link, set a new password, and sign in with it.
3. Provision a test company from the console and accept the activation link with a new address. The "Confirm your email" message should now be RISYS-branded.
4. In Resend → **Emails**, check that both messages are listed as delivered.

---

## OCI (self-hosted) — at or after move day

SMTP is already set to Resend in `/srv/supabase/.env`. Only the templates and subjects need adding. Self-hosted Auth reads templates from a URL; the app's nginx already serves them on the private network.

Add to `docker-compose.override.yml` under `services: auth: environment:`

```yaml
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: http://10.0.0.144:8080/email/templates/confirmation.html
      GOTRUE_MAILER_TEMPLATES_RECOVERY:     http://10.0.0.144:8080/email/templates/recovery.html
      GOTRUE_MAILER_TEMPLATES_INVITE:       http://10.0.0.144:8080/email/templates/invite.html
      GOTRUE_MAILER_TEMPLATES_MAGIC_LINK:   http://10.0.0.144:8080/email/templates/magic_link.html
      GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: http://10.0.0.144:8080/email/templates/email_change.html
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: "Confirm your email for RISYS"
      GOTRUE_MAILER_SUBJECTS_RECOVERY: "Reset your RISYS password"
      GOTRUE_MAILER_SUBJECTS_INVITE: "You have been invited to RISYS"
      GOTRUE_MAILER_SUBJECTS_MAGIC_LINK: "Your RISYS sign-in link"
      GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE: "Confirm your new email for RISYS"
```

Then:

1. Run `bash /srv/risys/deploy_frontend.sh` so the templates are served.
2. In `/srv/supabase`, run `docker compose up -d auth`.
3. Test step 4 above against OCI.

Check that `ADDITIONAL_REDIRECT_URLS` in `/srv/supabase/.env` includes `https://app.risysgrc.com/**`. It already does.
