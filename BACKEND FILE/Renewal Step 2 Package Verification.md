# Renewal Step 2 Package Verification

The updated EMS file was opened in a clean browser state. The Subscribe/Register entry point still opened the existing renewal overlay.

Renew Subscription now visibly contains three New Registration-style package cards as Step 2: Full School Package (GHC 250), Examination Package (GHC 150), and Individual Teacher (GHC 50). The cards retain the existing package-card styling and feature lists, and are clickable through `subv2RenewSelectPackage`.

The existing renewal school fields, Region and District controls, Current Access Code, Paystack payment button, contact fields, and renewal action remain present. The six login cards remained visible on the original login page before opening the renewal overlay.

## Interaction checks

All three package cards were clicked successfully. Full selected `full`, Examination selected `exam`, and Individual Teacher selected `teacher`, with the correct visual selection classes and active package value.

A mocked quote request confirmed that choosing Examination Package and the 1 Year period produced the URL `/api/payments/paystack/renewal-quote?period=1_year&packageId=exam` and displayed the returned amount. No real payment was initiated.

The six login cards—National, Regional, District, School, Parent, and Student—were present with clickable handlers or their existing dedicated IDs. Region and District controls remained present.
