# Objects and tasks

A small construction CRM. Managers create sites, assign work and review submissions. Executors see their own work and the sites it belongs to. React, TypeScript, Vite, Supabase Auth and PostgreSQL.

## Run locally

Use Node 24 or newer and Docker.

1. Run `npm ci` and `npx supabase start`. The first start downloads the local Supabase images. It applies the migration in `supabase/migrations` automatically.
2. Copy `.env.example` to `.env.local`. Use the API URL and the publishable (or local anon) key shown by `npx supabase status`.
3. To populate the demo, supply the following in the shell and run `npm run seed:demo` once against the dedicated demo project:

   | Variable | Value |
   | --- | --- |
   | `CRM_SUPABASE_URL` | Project API URL |
   | `CRM_SUPABASE_PUBLISHABLE_KEY` | Publishable or anon key |
   | `CRM_SUPABASE_ADMIN_KEY` | Secret or service role key, used only by the provisioning script |
   | `CRM_DEMO_FILE` | A new path in a private directory for the generated account credentials |

   This creates one manager, two executors, three sites and four tasks. It saves the generated passwords to the private file. Keep that file and the admin key outside the repository and browser environment.
4. Run `npm run dev` and open `http://127.0.0.1:5173`. Sign in with one of the generated accounts.

## Verify

- `npm run build` checks TypeScript and produces the static bundle.
- `npm run test:api` uses the same URL, publishable key and demo credentials. The test does not use the admin key. It exercises the full review loop, concurrent transitions, cross-account access, role changes, direct writes, comments and history tampering. It archives its fixtures after use.
- With the web app running, use `npx playwright install chromium` then `npm run test:ui` with the same demo credentials. It exercises the workflow through two independent browser sessions.

## Deploy

Use a dedicated Supabase project. Apply the migration with the Supabase CLI or the SQL editor and disable new sign-ups in Auth settings; password login must remain available. Run the seed script with the hosted project values. Test the hosted API before sharing the demo.

Build the frontend with only the public URL and publishable key. The bundle in `dist` can run on a static host. For GitHub Pages, set the repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, set Pages to deploy from GitHub Actions, and run the **Publish demo** workflow. Share the demo credentials separately from the repository.

## Decisions

- A task requires an existing site and one executor. All managers can review any task. A manager can edit details or reassign a task without changing its status.
- A site can be removed once its active tasks are removed or moved. Deletion archives records and preserves the history in the database; archived records are hidden in the app.
- A creation event starts the history. Further entries are written in the same transaction as the status change. The database derives the actor from the authenticated session and locks the task while validating the transition.
- The public Data API provides reads through row-level policies. Writes use narrowly scoped database functions, which verify the caller and operation. A user cannot change their role or write to the audit table through the API.
- User provisioning is an administrative operation. The app has no sign-up form. A single company and a small data set are in scope; the lists load the accessible demo records without pagination.
