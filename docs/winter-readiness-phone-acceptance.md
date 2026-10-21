# Winter Readiness: physical-phone acceptance plan

**Status: NOT EXECUTED.** Preparing checks is not a result. An automated mobile viewport test is separate from a real Android/iOS device test. This is a gate for Draft PR #27, not authorization to deploy.

## Safe test prerequisites

- Use a **temporary review build** of the staged Apiary Log and Winter pages pointed only at an authorized, isolated **test Supabase** environment. The publicly hosted production website does not yet contain this proposed Winter tab. Never assume GitHub's unmerged draft branch is published to the live site.
- Do **not** point a temporary webpage at the production database or share production API secrets to make it testable. Do not use private records or the original October 21 ZIP unless the owner specifically chooses an appropriately secured local-only test.
- Test account should have fictional hives/colonies, MFA enabled, and no sensitive production data. The user's existing populated online Recovery Test must not be reset or overwritten. Network exposure of any local Mac preview requires separate security planning; do not expose the Mac's private Docker API or service-role keys to the Internet.
- Record device/browser version, viewport/zoom, date, tester and environment URL. **Do not publish credentials, MFA codes, tokens, screenshot account data, real receipts or backup contents** in GitHub issues.

## Manual checks on a physical phone

Mark each case PASS / FAIL / NOT RUN; attach only redacted screenshots or synthetic examples.

| Case | User action | Expected result |
| --- | --- | --- |
| P01 | Open the authorized isolated preview and sign in with test account and six-digit MFA | Authentication succeeds; no Winter details appear before AAL2 |
| P02 | Open Hive 1's Winter tab in portrait orientation | Exactly ten hive tabs, two equal columns, five rows; all labels readable and touchable |
| P03 | Rotate portrait to landscape and back, including zoom/text scaling | No clipped essential labels, controls or horizontal scrolling within Winter; inputs remain usable |
| P04 | Open colony details, checklist, observation form and final-outcome form | Text inputs/selects/buttons reachable, labeled, sufficiently large; no keyboard covering the active save control without ability to scroll |
| P05 | Change the selected hive from Hive 1 to Hive 2 | Previous hive's private data is not shown; scoped child reloads and shows only Hive 2 |
| P06 | Navigate to Feedings and back to Winter | State and selected hive remain correct; no duplicate all-apiary controls in embedded view |
| P07 | On standalone Winter administration page, inspect closed-season history | Snapshot history visibly read-only, version/timestamp meaningful, reopening requires reason and MFA |
| P08 | Open another tab with Winter while signed in, then sign out of Apiary Log | Both tabs remove private content and require login again; revisit does not expose cached details |
| P09 | Retry a malformed field, empty exclusion reason and invalid hive link | Visible error, no unexpected write or route into another hive |
| P10 | Download a **fictional** complete backup through the standalone Winter page | ZIP verifies locally, only if explicitly configured for fictional test data; do not upload ZIP to GitHub |
| P11 | Navigate using Android accessibility tools (TalkBack optional), external keyboard if available | Focus order and labels make sign-in, tabs, forms and sign-out operable |

## Documentation and release decision

Record: reviewer, date, device/browser, each case result, any specific issues, and resolved/retested evidence. **Do not** check the manual-device release gate until required tests were performed by a person on a physical device using a safe nonproduction build.

Other gates remain: independent security sign-off, verified fresh production backup, documented safe production rollback, and separate explicit owner approvals for production SQL and merging/publishing PR #27.
