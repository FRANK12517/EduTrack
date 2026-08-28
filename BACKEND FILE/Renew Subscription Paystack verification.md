# Renew Subscription Paystack verification

The updated EMS Paystack copy was opened in Chromium and the existing Subscribe/Register entry point was used to open Renew Subscription.

The renewal form preserves School Name, Region, District, Current Access Code, Subscription Period, Contact Person, Phone, Email, and Back. The Payment Method is now a fixed Paystack display. The renewal panel contains Paystack payment status, dynamic amount placeholder, and a Pay with Paystack button. The old manual payment options and manual transaction/payment-proof fields are absent.

The browser test found the required Region and District controls, the five subscription-period options, and all six login cards. Each login card had an active click handler or its existing dedicated handler. Calling Pay with Paystack with empty fields produced the expected required-fields validation message without contacting a payment provider.

A real Paystack payment was not initiated. The local static file cannot call the production backend until the supplied renewal backend handlers are mounted in the EMS server.

## Final deterministic checks

The renewal backend reference passed syntax validation and a local test harness. The test confirmed a dynamic 1-year quote of GHC 250, conversion to 25,000 minor currency units for initialization, server-side verification, one-time finalization, and webhook duplicate protection. The updated frontend contains no secret-like Paystack token or bearer credential. The existing HTML files remain separate, and the Paystack renewal markers are present in the updated copy.
