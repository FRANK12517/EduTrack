# Renewal Access Code Order Verification

The updated Renew Subscription flow was tested in a clean browser state. Before payment, no new Access Code element was present. Clicking the Paystack action without selecting a package was blocked with a validation message; the same handler requires the old Access Code, school identity, package, period, and contact details before initialization.

The frontend only renders the new Access Code from the `newAccessCode` or `new_access_code` value returned by the verified-payment response. The backend reference now performs validation before Paystack initialization and requires the database transaction method `markRenewalVerifiedAndRotateAccessCodeOnce`, which must verify the payment, extend the subscription, revoke the old code, and generate the replacement code atomically and idempotently only after successful verification.

The six login cards remain present and interactive in the browser, and the existing Region → District controls remain intact.
