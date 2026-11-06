# B01–B09 Workspace, Tasks, Meetings & Calendar — independent build log

Date: 2026-11-06 • Workstream owner: B chat • Baseline: original 98-item checklist and separate A/C/D/E/F/G workstreams.

## Branch protection and handoff
- Isolated branch: workstream/b-workspace-meetings-2026-11-06
- Starting commit: 8e8db9628fed4863033bb690688f0575487e2480 (review snapshot, not main). No main merge or deployment. Never silently cherry-pick or overwrite another workstream.
- This branch is NOT live production work. Meeting mutations and meeting data live strictly in browser local demonstration storage. Firebase authenticated production reads/writes, server permission boundaries, push/email transports, and delivery receipts are not implemented.
- Consolidation owner must merge B changes by explicit diff review against final A/C branches. Check operations-hub.tsx, navigation-route-registry.ts, workspace-home.tsx, action-center-experience.tsx, and package.json collisions. Run full exact-SHA CI and owner-controlled staging acceptance.

## B checklist evidence

| ID | Current status | Evidence and unresolved acceptance requirement |
| --- | --- | --- |
| B01 | Partial / awaiting browser acceptance | Existing source-backed employee/customer Home preserved; added employee-only upcoming meetings/invitations panel and quick access. Verify roles in browser/mobile. |
| B02 | Partial / awaiting browser acceptance | Existing Approvals destination and actionable order approval controls retained. Needs end-to-end order permission/role acceptance. |
| B03 | Partial / awaiting browser acceptance | Existing Action Center filters/source links retained, with separate meeting invitation and change-review queue. Does not fabricate task completion or notification read states. |
| B04 | Partial / awaiting browser acceptance | Existing Exceptions and Completed Work retained; added separate My Agenda and My Invitations sidebar destinations. Full useful My Work audit still required. |
| B05 | Built-demo / production blocked | Replaced static calendar preview with week/month day groups showing user-visible staff meetings and existing scope-filtered field appointments. Cross-user off-scope calendars not verified. |
| B06 | Built-demo / production blocked | Create/edit/cancel meeting, active directory attendees, Arizona time, conflict checks, RSVP, record history, link, user-triggered personal ICS export. No real outgoing invite or third-party calendar integration. |
| B07 | Built-demo / production blocked | Upcoming staff meetings and invitation prompts visible on employee Home. These are in-app prompts, not scheduled notification delivery. |
| B08 | Partial-demo / production blocked | Invitees see in-app pending invitations and subsequent changes inside Action Center and My Invitations; organizer can see RSVP and revision history. Real transport, email/SMS, push and delivery receipts not implemented. |
| B09 | Partial / production blocked | Employees can only see meetings they organize or are invited to; customers and separated workers excluded, organizers limited to four staff roles, attendee dropdown excludes inactive/customer. Client-side demo gates do NOT establish production authorization. |

### Required release acceptance gates
1. Exact B branch commit CI lint, typecheck, logic, Firestore/Storage emulators, Functions and production build.
2. Authenticated server-side meeting storage and notification outbox with role/access enforcement and revocation; no PII from local browser meeting state in connected mode.
3. Desktop/tablet/mobile deep links, Back/Forward/refresh, role and attendee changes, schedule conflicts, invalid dates, cancel/edit, RSVP and timezones.
4. Tenant/user permission and document security review with revoked/separated identities, Firestore rules and server routes.
5. Mia's explicit acceptance, followed by separately authorized merge and deployment.

### Proposed next decision
Choose secure meeting storage/transport after the business owner confirms whether all employee roles can schedule or only managers, and whether email delivery is required at launch. Demo currently allows administrators, sales managers, operations and marketing as organizers.

### In-app bell integration: Nov 6
- Added revision-keyed, source-time-backed meeting invitation/update/cancellation notices to the existing notification bell for local demonstration only. Clearing the bell does not mark an RSVP or meeting action complete; newer revisions produce new notices.
- Notification click verifies allowed route and goes directly to that meeting rather than mistakenly navigating to Approvals.
- Production email, SMS, push, provider delivery receipts and server-side meeting data authorization still not implemented. B08 remains partial, B09 production blocked.
