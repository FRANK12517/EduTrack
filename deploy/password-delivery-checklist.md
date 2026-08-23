# Password-reset delivery deployment checklist

This checklist is a handoff for the approved email/SMS provider. It is not evidence that delivery is configured.

1. Configure `EDUTRACK_RESET_DELIVERY_PROVIDER` and provider credentials through the deployment secret manager only.
2. Confirm the provider sends generic reset instructions without placing reset tokens in URLs or logs visible to unrelated operators.
3. Confirm the application stores only the reset-token hash and never the plaintext token.
4. Exercise valid, invalid, expired, and reused reset-token cases in an isolated deployment.
5. Verify password change invalidates the intended sessions and creates a relational audit event.
6. Verify the old credential fails and the new credential succeeds.
7. Inspect application, ingress, provider, and monitoring logs for passwords, access codes, tokens, and provider secrets.
8. Record provider delivery result and incident/alert behavior in the release evidence.

If the provider is not configured, classify the gate as `NOT_PROVEN — PASSWORD DELIVERY PROVIDER UNAVAILABLE` and do not claim end-to-end reset delivery.
