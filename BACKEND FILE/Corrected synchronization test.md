
## Corrected synchronization test

After correcting the synchronizer to update both selectors directly, a simulated effective-price source of GHC 333.25, GHC 222.50, and GHC 111.75 produced matching values in all three New Registration package cards. The six login cards were all reported interactive. The renewal overlay was not open during that particular read, so it will be opened separately for the final matching-card assertion.

## Final regression results

After the direct synchronizer correction, a simulated effective price of GHC 333.25, GHC 222.50, and GHC 111.75 appeared identically in New Registration and Renew Subscription. The six login cards were all interactive, and the renewal Region and District controls remained present.

The backend regression test passed the required pricing rule: an active school with `priceAtSubscription` GHC 200.00 initialized renewal at 20,000 minor units even though the current package price was GHC 250.00. After the school expiry date, the same school initialized at 25,000 minor units. Verification, webhook signature processing, and duplicate finalization protection also passed.
