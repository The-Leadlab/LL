# TODO: Forms + Admin Email + Team Invite Signup

- [x] Ensure public intake form submissions are persisted in `marketing_form_submissions`.
- [x] Send submission notification email to all active admins/superusers.
- [x] Keep `info@the-leadlab.com` as the primary inbox (plus optional `to_email` / admins).
- [x] Preserve optional `to_email` override compatibility in form payload.
- [x] Keep form endpoint non-blocking when email sending fails.
- [x] Ensure Team Management invite modal includes required email field.
- [x] Ensure invite email copy/CTA explicitly communicates signup + join flow.
- [x] Keep invitation token flow (`/invite/{token}`) unchanged and working.
- [ ] Validate in production: submit each form and confirm all admin inboxes receive notifications.
- [ ] Validate in production: create invitation and confirm recipient gets signup/join email.

