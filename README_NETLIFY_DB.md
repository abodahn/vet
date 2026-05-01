# Premium Pet Clinic — Netlify Database Version V1

This is a Netlify-native rewrite starter for the uploaded Premium Pet Clinic Flask app.

## Architecture

- Static frontend: `public/index.html`
- Serverless backend: `netlify/functions/api.mjs`
- Database: Netlify Database/Postgres using `@netlify/database`

## Covered modules

Owners, Pets, Bookings, Reminders, Services, Users, Vets, Rooms, Roles & Permissions, WhatsApp Templates, Audit Log, Dashboard, CSV Export.

## Deploy steps

1. Push this folder to GitHub.
2. Create a Netlify site from the repo.
3. Enable Netlify Database from the site dashboard.
4. Add environment variables:

```env
APP_SECRET=write-a-long-random-secret
ADMIN_USER=Admin
ADMIN_PASS=1234
```

5. Deploy.

## Login

Username: `Admin`
Password: `1234`

Change these in Netlify environment variables before production.

## Local development

```bash
npm install
npx netlify dev
```

Open `http://localhost:8888`.

## Import old Excel data

Put your old `data` folder beside this project and run:

```bash
npm run import:xlsx -- ./data
```

The import script reads the old `.xlsx` files and upserts rows into Netlify Database.

## Note

This is not a line-by-line Flask conversion. It is a Netlify-native starter that keeps your main clinic modules and replaces local Excel files with Netlify Database.
