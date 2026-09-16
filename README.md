# Holy Rosary Parish, Bongao

Responsive parish website with a protected content-management workspace.

## New editing features

- Full-screen photo slideshow, up to eight uploaded backgrounds, reorder controls, positioning, dark overlay, text alignment, autoplay interval, pause controls, and reduced-motion support.
- Admin page-content editor for headings, welcome text, parish history, sacramental guidance, quick links, visitor messages, and public page descriptions. Separate settings manage the parish name, contact information, map link, Facebook link, and section visibility.
- `/people` contains current/former parish priests, PPC officers, choir members, and secretariat staff. Each profile has a photograph, biography, role, and one or more service periods. Unknown years may remain blank; no historical people or dates are seeded.
- The main navigation includes a visible **Admin Login** link.

## Railway deployment

The Railway runtime uses Node 24, a durable SQLite database, and photo files on one Railway volume. It preserves the existing content model and does not depend on Cloudflare or ChatGPT sign-in. Use one replica because the SQLite database and photos belong to the attached volume.

1. Push this source to a dedicated GitHub repository. Do not use an unrelated POS repository.
2. Connect that repository to a new Railway service. The included Dockerfile and `railway.toml` configure the build, start command, and health check.
3. Attach a Railway volume at `/data`. Set `DATA_DIR=/data`. Railway provides `RAILWAY_VOLUME_MOUNT_PATH`; the server checks that the two match to avoid silently storing uploads on the ephemeral filesystem.
4. Generate the service domain. Set `PUBLIC_URL` to its exact HTTPS origin (no trailing slash), `ADMIN_EMAIL` to the owner's email, and `ADMIN_SETUP_TOKEN` to a cryptographically random value of at least 32 characters. Keep that token in Railway variables, never in Git or public page content.
5. Open `/admin/setup#token=THE_PRIVATE_SETUP_TOKEN` privately. The fragment is removed from the address bar after loading. Set your own password of at least 12 characters. Setup is disabled once the first admin exists. You may then remove `ADMIN_SETUP_TOKEN` from Railway.
6. Use `/admin` to sign in by email and password. **Admin account** changes the password and invalidates other sessions. Sessions expire after 12 hours, use HttpOnly/Secure/SameSite cookies, and store only token hashes in SQLite. All externally supplied Sites identity headers are stripped by the Node server.

The Docker build does not create the database or photos. Migrations run when the server starts and the volume is mounted. Enable Railway volume backups for operating data. Existing live Sites content is not automatically copied by moving the source repository: retain the original deployment and migrate any published records and uploads before replacing it.

The conventional password login is available in the Railway runtime. The existing Sites runtime continues to use platform sign-in until the host migration is completed.

## Staff accounts on Railway

Open **Admin account → Staff users → Add staff user** as the primary administrator. Enter a name, unique email, initial password (12–256 characters), and committee role. Available roles are Secretary staff, Choir Head, PCC Head, PPC Secretary, and KofC. Choose Other to enter a custom committee such as Choir Secretary or KofC Secretary.

All staff committees receive the same posting permissions: manage blog posts, photos, events, worship schedules, Sunday collections, and parish profiles. Staff sign in through the same Admin Login page with their own email and password and may change their own password. Only the owner can create/edit/disable staff, reset their passwords, edit website settings, or read detailed audit history. Disabling an account, changing its login email, or resetting its password invalidates its sessions. Disabled accounts retain their posts. Account changes are audited without passwords or password hashes. Staff account creation does not send email.

Migration 0002 preserves the existing sole administrator as the owner. Newly created staff can never assign themselves owner access; their committee label does not grant additional privileges.

## Public pages

- `/` — existing parish design, managed photos/contact information and latest updates
- `/blog` and `/blog/:id` — published stories and photo galleries
- `/events` — upcoming/ongoing and past activities
- `/schedules` — weekly and one-time Mass, confession and devotional schedules
- `/collections` — Sunday reports, breakdowns and year totals in Philippine pesos
- `/people` — profiles and historical service trails by parish group

## Administration

On the original Sites host, `/admin` uses dispatch-owned Sign in with ChatGPT. Railway uses the owner/staff password accounts described above. The server requires the owner email configured in `ADMIN_EMAIL`, then pins the stable, site-scoped user ID on first access. Every admin API checks authorization; mutations also require the same origin and a custom request header. There is no public registration or shared default password.

The owner can create, edit, publish, unpublish, and delete content; upload JPG/PNG/WebP photos up to 8 MB; choose homepage photographs; and change official visitor information. Drafts and unused uploads are private. Photos referenced by drafts or published records cannot be deleted. Publishing content exposes only its selected photos. Photos and structured records persist in R2 and D1 respectively.

Collections are entered as decimal strings and calculated server-side using integer centavos. Each active Sunday date is unique. Corrections, publishing changes, and removals are retained in a private audit trail. This is an informational summary, not a donation-payment system.

Times are entered and displayed in Asia/Manila. Collection dates are date-only Sunday values. No official records, contact details, or sample collection amounts are seeded.

## Development and deployment

- Node 24 (tests use `node:sqlite`)
- `npm ci`
- `npm run db:generate` after changing `db/schema.ts`
- `npm run build`
- `npm test`

`scripts/build.mjs` emits a Cloudflare-compatible ESM Worker with embedded website assets. Source assets remain in `public/`; generated `dist/` is ignored. The hosting manifest retains the existing Site ID and declares `DB` and `BUCKET`; platform provisioning and generated Drizzle migrations create persistent storage during deployment. Configure `ADMIN_EMAIL` as a server environment value through Sites. Production must only be served behind Sites dispatch, which sanitizes identity headers. No test identity bypass is included in the Worker.

For Railway, `npm start` runs the Node HTTP adapter around the same application. It validates its own password sessions, strips incoming identity headers, and provides the authorized identity to the shared application internally. `tests/railway.test.mjs` exercises real HTTP login/setup/logout/password changes, header-spoof rejection, and database/photo persistence across a server restart. No browser testing is implied by this test suite.

The backend workflow tests exercise real SQLite migrations via a D1-compatible test adapter and an in-memory R2 test double. They cover owner authorization, origin protection, publish/unpublish behavior, draft-media privacy, invalid uploads, exact collection totals, Sunday uniqueness, stale edits, audit history, schedule validation and settings. Browser/device QA is not part of this test suite.

Default devotional photograph: James Coleman, Unsplash, https://unsplash.com/photos/QHRZv6PIW4s. It does not depict the parish building. Photo attribution remains until both original homepage placements are replaced.

### Parish leadership hierarchy

The primary administrator can open **Parish hierarchy** (`/admin#hierarchy`).
The starter chart includes the Parish Priest, choir, PPC, KofC, youth, separate
Knights and Ladies of the Altar, secretary, and utility/maintenance positions.
Select a circle to edit its name, position, and photograph. Select **Other** to
enter a custom committee or position. **Under the leadership of** assigns any
eligible leader. Dragging a photo onto another leader moves the person and their
entire downline; the priest remains the single root. The editor also supports
undoing the last move, removing positions (direct members move up one level),
copying names/photos from directory profiles, and discarding unsaved changes.
Copied profile details are independent of the historical directory.

**Save & publish hierarchy** updates `/hierarchy`; unsaved edits stay in the
current browser page. The initial public chart is empty until the first save.
The chart has circular portraits, connecting lines, collapsible branches, zoom,
and an indented list view (selected initially on small screens). There are up to
200 positions and 12 levels below the priest. Cycles and stale saves are rejected.
Hierarchy data is stored in the existing SQLite settings table under its own
`hierarchy` row, independently of homepage settings, with an audit record for
each save. Referenced photographs are publicly accessible and protected from
photo-library deletion until removed from the saved hierarchy.
