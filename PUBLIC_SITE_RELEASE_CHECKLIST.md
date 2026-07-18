# Angel Tree Services Public Site Release Checklist

## Release Decision

**Status:** Conditionally ready for a controlled Netlify release. Do not publish until every item marked **Approval gate** is resolved.

The review did not deploy, change DNS, modify the admin Netlify site, submit a real lead, submit a sitemap, or request indexing.

## Approved Scope

The release contains one hand-maintained homepage and nine build-generated routes:

| Page | Public URL | Build artifact |
| --- | --- | --- |
| Homepage | `https://angeltreeservices.org/` | `dist-public/index.html` |
| Services | `https://angeltreeservices.org/services/` | `dist-public/services/index.html` |
| Tree removal | `https://angeltreeservices.org/services/tree-removal/` | `dist-public/services/tree-removal/index.html` |
| Tree pruning | `https://angeltreeservices.org/services/tree-pruning/` | `dist-public/services/tree-pruning/index.html` |
| Stump grinding | `https://angeltreeservices.org/services/stump-grinding/` | `dist-public/services/stump-grinding/index.html` |
| Emergency tree service | `https://angeltreeservices.org/services/emergency-tree-service/` | `dist-public/services/emergency-tree-service/index.html` |
| Commercial/HOA tree care | `https://angeltreeservices.org/services/commercial-hoa-tree-care/` | `dist-public/services/commercial-hoa-tree-care/index.html` |
| Credentials and safety | `https://angeltreeservices.org/credentials-safety/` | `dist-public/credentials-safety/index.html` |
| Project library | `https://angeltreeservices.org/projects/` | `dist-public/projects/index.html` |
| Reviews, recognition, and media | `https://angeltreeservices.org/recognition/` | `dist-public/recognition/index.html` |

No individual case-study or location page is approved or emitted.

## Build Contract

| Setting | Required value |
| --- | --- |
| Netlify site | `verdant-shortbread-99c404` (`86c48a95-ead4-4b15-8e57-fa827558b2f0`) |
| Base directory | Repository root; no subdirectory |
| Build command | `npm run test:public` |
| Publish directory | `dist-public` |
| Build runtime | Node.js/npm and Python 3 |
| Static-build environment variables | None |
| Canonical origin | `https://angeltreeservices.org` |
| CRM origin | `https://admin.angeltreeservices.org` (separate application and deployment) |

`npm run test:public` performs both generation and validation. It must fail the Netlify build if either phase fails.

```bash
npm run build:public
npm run validate:public
```

The combined release command is:

```bash
npm run test:public
```

The builder removes and recreates only `dist-public/`, copies the curated public source and assets, and invokes `scripts/build-public-pages.py` inside that directory. The generator is not allowed to target the repository root. Generated routes, `sitemap.xml`, and `robots.txt` are build artifacts and are not committed.

## Release Source Files

These files define or enforce the public release:

- `.gitignore`
- `index.html`
- `overrides.css`
- `ats-form-enhancements.js`
- `site-pages.css`
- `site-pages.js`
- `package.json`
- `netlify.toml`
- `scripts/build-public-site.py`
- `scripts/build-public-pages.py`
- `scripts/validate-public-site.py`
- `PUBLIC_RECOGNITION_SOURCES.md`
- `RECOGNITION_IMPLEMENTATION_REPORT.md`
- `assets/`
- `angeltreeservices_backup_files/`

These formerly committed outputs must remain deleted from source control because the build now owns them:

- `credentials-safety/index.html`
- `projects/index.html`
- `services/index.html`
- `services/tree-removal/index.html`
- `services/tree-pruning/index.html`
- `services/stump-grinding/index.html`
- `services/emergency-tree-service/index.html`
- `services/commercial-hoa-tree-care/index.html`
- `sitemap.xml`
- `robots.txt`
- `scripts/__pycache__/build-public-pages.cpython-314.pyc`

## Expected Publish Artifact

`dist-public/` must contain exactly ten `index.html` files at the routes listed above, plus:

- `dist-public/overrides.css`
- `dist-public/ats-form-enhancements.js`
- `dist-public/site-pages.css`
- `dist-public/site-pages.js`
- `dist-public/sitemap.xml`
- `dist-public/robots.txt`
- `dist-public/assets/`
- `dist-public/angeltreeservices_backup_files/`

The validator must reject extra indexable routes and public copies of non-release application source, reports, Markdown audits, screenshots outside the curated asset directories, environment files, site-authored local paths/localhost URLs, or secrets. Legacy Squarespace vendor bundles remain intentionally unmodified; their inert internal fallback/test strings are not site URLs or network targets.

## Clean Build Verification

The following process passed from a prospective clean checkout without `node_modules`:

```bash
npm run test:public
find dist-public -name index.html -print | sort
find dist-public -type f -print0 | sort -z | xargs -0 shasum -a 256
npm run test:public
find dist-public -type f -print0 | sort -z | xargs -0 shasum -a 256
netlify build --offline
git diff --check
```

Expected result: eleven page files, two matching artifact hash manifests, no source mutation, a successful local Netlify build, and no whitespace errors.

## Approval Gates

- [ ] **Business claim evidence:** confirm the public `ISA Certified Arborist` credential is active and verifiable.
- [ ] **Business claim evidence:** confirm the verified public hierarchy: `30+ years of tree-industry experience`, `founded in 2015`, and `founder with more than 20 years in the industry before 2015`.
- [ ] **Recognition source freshness:** reverify the live Google rating, review-count threshold, profile URL, exact Best of the Burg finalist listing, and NBC4 links immediately before publishing.
- [ ] **Netlify dashboard:** verify there is no dashboard base-directory, build-command, or publish-directory override that conflicts with repository `netlify.toml`.
- [ ] **Netlify redirects:** inspect dashboard-controlled redirects before adding or changing repository redirects. Do not run redirect changes blindly.
- [ ] **Domain decision:** confirm whether `angeltreeservice.org` and `www.angeltreeservice.org` should continue returning canonicalized `200` pages or should be approved for a future `301` redirect to `https://angeltreeservices.org/`.
- [ ] **CRM compatibility:** verify the separate admin application still allows the public origins and exposes `https://admin.angeltreeservices.org/api/leads`.
- [ ] **Rate-limit decision:** replace the CRM's process-memory public-lead limiter with durable shared storage, or explicitly accept it as best-effort for this low-volume release. Replace it before intentional high-volume traffic.
- [ ] **Real lead approval:** obtain explicit permission before submitting one controlled production lead.
- [ ] **Release authorization:** obtain explicit approval for the exact Git commit and Netlify production publish.

The static public build itself needs no environment variables. The separate CRM retains its existing runtime configuration; no CRM environment values belong in the public artifact.

## Current Production Baseline and Backup

At review time, Netlify reported:

| Item | Baseline |
| --- | --- |
| Production commit | `73358a371d221d81770467bd49f2b9f3a3fc33ad` |
| Production deploy | `6a5ab6d61cf11300081138b1` |
| Deploy context | `production`, branch `main` |
| Published | July 17, 2026 at `23:13:39 UTC` |
| Netlify dashboard | `https://app.netlify.com/projects/verdant-shortbread-99c404` |

Before release:

- [ ] Record the currently published deploy ID again in case production changes after this review.
- [ ] Lock or retain that deploy in Netlify so it remains available for immediate republish.
- [ ] Record the approved release commit and artifact hash manifest in the release notes.
- [ ] Confirm the CRM/admin deployment remains separate and untouched.

## Manual Netlify Release

1. Confirm the worktree contains only the approved release and documentation changes.
2. Run `npm run test:public` and `git diff --check` from the repository root.
3. Review `dist-public/` and confirm its ten-page inventory.
4. Commit the exact approved release on a release branch.
5. Push the release branch and let Netlify create a Deploy Preview using repository `netlify.toml`.
6. Confirm the Deploy Preview log shows `npm run test:public` and publishes `dist-public`.
7. Run the non-PII preview smoke checks below. Do not submit a real lead from the preview.
8. Confirm dashboard base/build/publish settings and redirects do not override the repository contract.
9. Obtain final production approval.
10. Merge or publish through the site's established controlled production path. If main-branch auto-publishing would bypass the desired approval window, stop auto-publishing before merge and manually publish the approved deploy afterward.
11. Run the production smoke checklist immediately.
12. Submit one controlled production lead only after separate explicit approval.

Do not deploy with `netlify deploy --prod` from an unreviewed working directory.

## Production Smoke Checklist

- [ ] Homepage returns `200` and displays the hero in the first viewport.
- [ ] All ten approved URLs return `200`.
- [ ] Shared CSS and JavaScript return `200` with no MIME or mixed-content errors.
- [ ] Desktop navigation works at 1440px and 1024px without wrapping.
- [ ] Mobile navigation opens, closes, and is keyboard accessible at 768px, 390px, and 360px.
- [ ] Wave transitions, cream/white surfaces, form spacing, and approved homepage appearance match the preview.
- [ ] No page has horizontal overflow or a blank first viewport.
- [ ] Sticky mobile Call/Estimate actions disappear near the contact form.
- [ ] Every phone link opens `(540) 388-8715`.
- [ ] Every estimate CTA reaches the homepage form.
- [ ] Tree removal, tree pruning, stump grinding, emergency, and commercial CTA preselection is correct.
- [ ] Canonical and Open Graph URLs use `https://angeltreeservices.org`.
- [ ] `https://angeltreeservices.org/sitemap.xml` contains all and only the ten approved URLs.
- [ ] `/recognition/` shows `4.9 stars from 120+ Google reviews`, finalist status in `Best Tree Trim/Removal Services`, and factual NBC4 coverage without endorsement language.
- [ ] The recognition video loads an official `youtube-nocookie.com` iframe only after a keyboard- or pointer-initiated click and does not autoplay.
- [ ] Official Google, Best of the Burg, NBC4 article, NBC4 video, and YouTube links reach the verified sources recorded in `PUBLIC_RECOGNITION_SOURCES.md`.
- [ ] `https://angeltreeservices.org/robots.txt` references the production sitemap and does not block required assets.
- [ ] Production HTML, metadata, JSON-LD, alt text, sitemap, and robots contain no TRAQ claim.
- [ ] Browser consoles show no new release error; known homepage Squarespace legacy warnings are compared against the baseline.
- [ ] No asset returns `404`.
- [ ] No audit file, Markdown report, private screenshot, application source, or environment file is publicly accessible.
- [ ] **Explicit real-lead approval required:** submit one uniquely labeled controlled website lead.
- [ ] **Explicit real-lead approval required:** verify exactly one CRM record, correct source page, selected service, request type, referrer, UTM values, and submission ID.
- [ ] **Explicit real-lead approval required:** verify customer success independently from internal email/SMS notification status.

## Rollback Triggers

Republish the retained baseline deploy immediately if any of these occur:

- One or more approved routes, shared assets, sitemap, or robots returns `404` or `5xx`.
- Homepage or form layout materially differs from the approved preview.
- Mobile horizontal overflow, blank first viewport, inaccessible navigation, or blocked form controls reappear.
- Canonical URLs point to a preview/local origin or an unapproved hostname.
- A TRAQ claim, private file, non-public application source, secret, or audit artifact is publicly exposed.
- Valid lead submissions fail to reach the CRM, create duplicates, lose attribution, or falsely report success after a database failure.
- An unexpected dashboard redirect creates a loop or sends traffic away from approved routes.

Rollback procedure:

1. In Netlify, republish the retained prior production deploy, using baseline deploy `6a5ab6d61cf11300081138b1` if it is still the confirmed prior production version.
2. Verify the homepage, form, canonical domain, robots, sitemap, and highest-priority service routes.
3. Revert the release commit as a new commit; do not rewrite shared branch history.
4. Correct and validate the issue in a Deploy Preview before another production attempt.
5. If only internal notifications fail while the lead is saved, keep customer-facing success and repair notifications separately; do not roll back solely for that secondary failure.

## Search and Indexing Follow-Up

Perform only after production smoke testing succeeds:

- Verify or submit `https://angeltreeservices.org/sitemap.xml` in Google Search Console.
- Request a homepage recrawl after confirming TRAQ removal remains live.
- Request recrawls for the services hub and priority service pages.
- Monitor old or incorrect snippets without promising immediate replacement or ranking changes.
- Check Google's selected canonical and indexed-page coverage.
- Do not request indexing for withheld case studies, previews, reports, or placeholders.

## Review Evidence

- Deterministic local build: passed twice with matching artifact hashes.
- Clean prospective checkout: passed twice without `node_modules` or committed generated pages.
- Repository Netlify build: `netlify build --offline` passed.
- Browser route matrix: 40 generated-page width checks passed at 1440px, 1024px, 768px, 390px, and 360px.
- Homepage width matrix: passed with no horizontal overflow; the 768px exported-header gap was corrected.
- New-page console review: zero errors or warnings.
- Form response simulations: JSON success, empty `2xx`, explicit `ok:false`, server failure, data retention, and repeated-click protection passed.
- Production availability: all nine approved URLs returned `200` during the review.
- Production TRAQ scan: zero matches across all nine pages, sitemap, and robots on July 17, 2026.
- Admin application checks: `npm run typecheck` and `npm run build` passed; no CRM code was changed by this release review.
- Real production lead submission: not performed.
- Deployment: not performed.
