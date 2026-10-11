# ACSRC Clinic Billing - Server + App

One server runs everything: the database, the login system and the billing app itself.
Open the server's web address in any browser (any computer, tablet or phone) and sign in.

## What you get
- Admin and staff logins (separate roles). Only admin sees the Admin menu, staff accounts and the activity log.
- One shared database: a bill made on the reception computer shows on the doctor's computer.
- Dashboard, patients, bills, reports, A4 print, PDF invoice, WhatsApp share, Excel export.
- Data is kept separate per clinic, so one server can host more than one clinic.

## Try it on your own computer
    npm install
    cp .env.example .env      # then set JWT_SECRET to a long random text
    npm start
Open http://localhost:4000 and create the clinic and the admin account on first start.

## Put it online (Railway)
1. Upload this folder to a GitHub repository.
2. On railway.app: New Project -> Deploy from GitHub repo -> choose it.
3. Variables: JWT_SECRET = a long random text; DATA_DIR = /app/data
4. Add a Volume mounted at /app/data (this keeps the database safe between updates).
5. Settings -> Networking -> Generate Domain. That address is your clinic's app: open it in the browser.
6. First visit: create the clinic and the admin account. Then add staff from Menu -> Admin.

## Notes
- Back up the database file (data/clinic.db) regularly (Railway volume backups, or download the file).
- Passwords are stored hashed. Login sessions expire after 12 hours.
- The app shows the latest 2000 bills. Older ones stay in the database.
