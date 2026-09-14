# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Operators ("Security Officers")** — employees of the security-services company (A-Force) who run virtual patrols: they step through a route's checkpoints, watch the live camera feed for each one, complete its checklist, and log an all-clear or a comment. They're assigned to specific sites (`OperatorSiteAssignment`) and only run one active patrol per site at a time.
- **Admins ("System Administrators")** — A-Force staff who configure the operation: sites, cameras (RTSP/CCTV), routes and their checkpoint order, checklist templates, user accounts, and who review Active Patrols, Reports, and History across all sites.
- **Viewers ("Client Viewers")** — the client whose site is being patrolled; read-only access to the Dashboard and Reports for their own site(s), as proof the patrol happened and what was found.

## Product Purpose

Virtual Patrol lets a security-services company run and prove site patrols remotely over CCTV instead of sending a guard to physically walk the site. An Operator works through a defined Route of checkpoints (each tied to a camera and a checklist); each checkpoint's completion is captured with a checklist state, a comment, and a screenshot, building an auditable record of the round. Admins configure the sites/cameras/routes/checklists that make this possible and monitor patrols as they happen; clients (Viewers) see the resulting reports as evidence of coverage.

## Positioning

The differentiating mechanism is **camera-verified checkpoints in place of a guard's physical footsteps**: presence and condition at each checkpoint are established by a live camera view plus a checklist and screenshot, not by a person's physical location. This is what a generic CCTV-viewer or a generic guard-tour/GPS-checkpoint app couldn't claim in the same way — the round is both remote (no foot patrol required) and evidenced (screenshot + checklist per checkpoint, retained in `CheckpointResult`).

## Operating Context

- A patrol runs against a **Route**: an ordered list of **RouteCheckpoints**, each bound to one **Camera** and one **ChecklistTemplate**.
- Only one active patrol job can run per site at a time (`ActivePatrol` is a one-row-per-site lock); a patrol job can be left `DRAFT`/`IN_PROGRESS` and resumed via `lastCheckpointId`.
- Cameras stream via RTSP, converted to HLS for browser viewing (per commit history: "Support RTSP camera links with ffmpeg-to-HLS conversion").
- Incidents and Alerts are raised against a site/camera (and optionally an in-progress patrol context) and are triaged by severity/status, separately from routine checkpoint results.
- Admins produce/export Reports (including bulk report download) and can review Patrol History and per-site Active Patrol status from a central Dashboard.
- An AuditLog records administrative/system actions by user.

## Capabilities and Constraints

- Roles are fixed and mutually exclusive per user: `ADMIN`, `OPERATOR`, `VIEWER` (Prisma `UserRole`); the frontend nav and route access are gated by role.
- A site, route, camera, or checklist template is configuration data owned by Admins; Operators consume it during a patrol but don't edit it.
- Backend: NestJS + Prisma + PostgreSQL, JWT-based auth (passport-jwt), Puppeteer/pdf-lib for report generation, archiver for bulk downloads.
- Frontend: React 19 + Vite + TypeScript + Tailwind CSS v4, TanStack Query, react-router-dom, hls.js for camera streams, recharts for dashboard charts, @dnd-kit for route/checkpoint ordering.
- Several nav items (e.g., anything not in `builtPages` in `App.tsx`) render an explicit "In Development" placeholder rather than a broken page — a deliberate incomplete-module signal to preserve, not a bug to silently finish.

## Brand Commitments

- Product name: **Virtual Patrol**. Company/brand: **A-Force** (shown as "A-Force" logo + "Virtual Patrol / Security Management" lockup in the sidebar). Keep both names and the existing logo assets (`frontend/public` and `backend/assets/logo.png`) as the binding identity.
- Camera feeds, checkpoint screenshots, and incident/alert evidence are **confidential client data** — never use real captured feed/screenshot content as filler or demo material in design work; use clearly-marked placeholder imagery instead.

## Evidence on Hand

- Live and historical UI already exists for Dashboard, Users, Sites, Cameras, Routes, Checklists, Patrol (run), Active Patrols, Reports, and History (`frontend/src/pages/*`), plus recent work on bulk report download, dashboard stat cards, active-patrol checkpoint tracking, and bulk site/patrol delete (per recent commit history).
- No customer testimonials, case studies, pricing, or external marketing evidence exists in the repo — this is an internal operations tool, not a marketing site, so none should be fabricated.

## Product Principles

1. **Evidence over assertion** — every checkpoint, incident, and report should read as proof (checklist + screenshot + timestamp), not just a status label.
2. **Role-scoped by default** — Admin (configure/oversee), Operator (execute), Viewer (receive proof) are distinct jobs; UI for one role should not leak controls meant for another.
3. **One active patrol per site is a hard invariant** — design must make the single-active-patrol lock and resume-from-last-checkpoint behavior legible, not hide it.
4. **Confidential by default** — camera imagery and screenshots are real client sites; treat them as sensitive in every surface, including design/demo contexts.
5. **Honest incompleteness** — an unfinished module says so explicitly ("In Development") rather than shipping a half-working page.
