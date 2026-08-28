# Paystack Integration Notes

Official sources consulted:

1. https://paystack.com/docs/developer-tools/inlinejs/
   Paystack InlineJS supports CDN loading through `https://js.paystack.co/v2/inline.js`, `PaystackPop`, `resumeTransaction(access_code)`, and callbacks such as `onSuccess`, `onCancel`, and `onError`. Server-initialized transactions can be resumed in the browser with an access code.

2. https://paystack.com/docs/payments/accept-payments/
   Paystack recommends initializing transactions on the backend, returning safe authorization data to the frontend, completing payment with the access code, and independently verifying transaction status and amount before delivering value. The secret key must not be used in frontend code. Successful payment webhooks use the `charge.success` event and must be handled securely.
