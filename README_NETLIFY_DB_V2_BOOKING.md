# Premium Pet Clinic — Netlify Database V2 Booking Build

This V2 package fixes the first Netlify starter by adding a real Booking Center.

## Why V1 was not the same

The original offline app is a Flask + Excel application. Netlify does not run that Flask app directly as a normal long-running server. A Netlify version must use:
- static frontend
- Netlify Functions
- Netlify Database/Postgres

V1 was only an architecture starter. V2 adds the missing booking workflow.

## V2 booking features

- New Customer booking
- Old Customer search by owner / phone / pet
- Owner selection
- Pet selection or create new pet under selected owner
- Appointment start / duration / end calculation
- Appointment type, priority, status, channel
- Vet and room
- Diagnosis / reason and symptoms
- Multiple service selection
- Quantity, fee, per-service reminder date
- Discount by value or percent
- Paid amount, due amount, payment channel
- Appointment reminder creation
- Service reminder creation
- Invoice number generation
- Booking list with owner/pet names
- CSV export
- Audit log

## Deploy

1. Push this folder to GitHub.
2. Create a Netlify site from the GitHub repo.
3. Enable Netlify Database for the site.
4. Add environment variables:
   APP_SECRET=long-random-secret
   ADMIN_USER=Admin
   ADMIN_PASS=change-this-password
5. Deploy.

## Local dev

Install Node.js 20.12.2+ and Netlify CLI 26+.

```bash
npm install
npx netlify dev
```

## Import old Excel data

Put the old `data` folder beside this project, then run:

```bash
npm run import:xlsx -- ./data
```

Run this after linking the project to Netlify Database.
