# Deploying MySeat

This guide puts MySeat online for free:

| Part     | Where             | What it runs                 |
| -------- | ----------------- | ---------------------------- |
| Database | **MongoDB Atlas** | your data (M0 free cluster)  |
| Backend  | **Render**        | the Express API in `server/` |
| Frontend | **Vercel**        | the React app in `client/`   |

Do the steps **in this order**: each one needs an address from the one before.

You'll need: a GitHub account with this project pushed to a repository, plus free accounts on [MongoDB Atlas](https://www.mongodb.com/atlas), [Render](https://render.com) and [Vercel](https://vercel.com). You can sign in to Render and Vercel with GitHub.

Keep a scratch note open while you go. You'll collect four values:

```
MONGO_URI    = (from step 1)
JWT_SECRET   = (from step 2)
API URL      = (from step 2, e.g. https://myseat-api.onrender.com)
FRONTEND URL = (from step 3, e.g. https://myseat.vercel.app)
```

---

## 1. MongoDB Atlas (database)

If you already use Atlas for development, you can use the same cluster but give production **its own database name**, so seeding or testing locally can never wipe live data.

### 1.1 Create a database user

1. Atlas: open your project, then **Security > Database Access > Add New Database User**.
2. Authentication method: **Password**. Pick a username (e.g. `myseat-prod`) and click **Autogenerate Secure Password**. Copy the password somewhere safe.
3. Built-in role: **Read and write to any database**. Click **Add User**.

### 1.2 Allow Render to connect (Network Access)

Render's free plan doesn't give your server a fixed IP address, so Atlas has to accept connections from anywhere. The database user and password still protect it.

1. **Security > Network Access > Add IP Address**.
2. Click **Allow Access from Anywhere** (this fills in `0.0.0.0/0`). Click **Confirm**.

If you skip this, the Render logs will show a timeout or `MongoServerSelectionError` when the server starts.

### 1.3 Copy the connection string

1. **Database > Connect > Drivers**, choose Node.js, and copy the string. It looks like:

   ```
   mongodb+srv://myseat-prod:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```

2. Replace `<db_password>` with the password from 1.1.
3. Add a database name after `.net/`, for example `myseat-prod`:

   ```
   mongodb+srv://myseat-prod:YOUR_PASSWORD@cluster0.abcde.mongodb.net/myseat-prod?retryWrites=true&w=majority&appName=Cluster0
   ```

That's your **MONGO_URI**. If the password contains characters like `@`, `/` or `:`, either autogenerate a new one without them or URL-encode them (e.g. `@` becomes `%40`).

---

## 2. Render (backend API)

### 2.1 Make a JWT secret

Run this on your computer and copy the output. It's your **JWT_SECRET**. Don't reuse the one from your local `.env`.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2.2 Create the web service

1. Render dashboard: **New > Web Service**, and connect your GitHub repository.
2. Fill in:

   | Setting            | Value                                  |
   | ------------------ | -------------------------------------- |
   | Name               | `myseat-api` (becomes part of the URL) |
   | Region             | the one closest to your Atlas cluster  |
   | Branch             | `main`                                 |
   | **Root Directory** | `server`                               |
   | Runtime            | Node                                   |
   | **Build Command**  | `npm install`                          |
   | **Start Command**  | `npm start`                            |
   | Instance Type      | **Free**                               |

3. Under **Environment Variables**, add:

   | Key                     | Value                                                       |
   | ----------------------- | ----------------------------------------------------------- |
   | `MONGO_URI`             | your connection string from step 1.3                        |
   | `JWT_SECRET`            | the secret from step 2.1                                    |
   | `JWT_EXPIRES_IN`        | `1d`                                                        |
   | `NODE_ENV`              | `production`                                                |
   | `HOLD_DURATION_SECONDS` | `300`                                                       |
   | `CLIENT_URL`            | `http://localhost:5173` for now; you'll change it in step 4 |
   | `NODE_VERSION`          | `22`                                                        |

   Do **not** add `PORT`: Render sets it for you, and the server already reads it.

   `NODE_ENV=production` matters: it hides error details and stack traces from API responses, and it keeps rate limiting on.

4. Optional but useful: **Advanced > Health Check Path** = `/api/health`.
5. Click **Create Web Service**. The first build takes a few minutes. Watch the **Logs** tab until you see:

   ```
   MongoDB Connected: ...
   Server running in production mode on port 10000
   ```

### 2.3 Check it works

Your API address is shown at the top of the service page, e.g. `https://myseat-api.onrender.com`. That's your **API URL**. Open this in a browser:

```
https://myseat-api.onrender.com/api/health
```

You should see `{"status":"ok","db":"connected"}`. If `db` says `disconnected`, recheck step 1.2 and your `MONGO_URI`.

### 2.4 The free plan sleeps

A free Render service **goes to sleep after about 15 minutes with no requests**. The next request wakes it up, which takes **up to a minute**. The frontend shows "The server is waking up (free hosting), this can take up to a minute." on the events page when this happens. After that, it's fast again until it sleeps.

Also on the free plan: the server's memory is wiped when it sleeps. Nothing important lives there, because all data is in Atlas, but the rate-limit counters reset.

---

## 3. Vercel (frontend)

1. Vercel dashboard: **Add New > Project**, and import the same GitHub repository.
2. Fill in:

   | Setting            | Value                                 |
   | ------------------ | ------------------------------------- |
   | Framework Preset   | Vite (usually detected automatically) |
   | **Root Directory** | `client` (click Edit next to it)      |
   | Build Command      | `npm run build` (default)             |
   | Output Directory   | `dist` (default)                      |

3. Under **Environment Variables**, add:

   | Key            | Value                                                                                  |
   | -------------- | -------------------------------------------------------------------------------------- |
   | `VITE_API_URL` | your API URL from step 2.3, e.g. `https://myseat-api.onrender.com` (no trailing slash) |

   Vite copies `VITE_` variables into the app **when it builds**. If you change this value later, you must redeploy (Deployments > ... > Redeploy) before it takes effect.

4. Click **Deploy**. When it finishes, Vercel shows your site's address, e.g. `https://myseat.vercel.app`. That's your **FRONTEND URL**.

`client/vercel.json` sends every path to the React app, so refreshing a page like `/events/123` works instead of showing a Vercel 404.

---

## 4. Connect the frontend to the backend (CORS)

The API only accepts browser requests from addresses listed in `CLIENT_URL`. Right now that's still `localhost`.

1. Render: your service > **Environment** > edit `CLIENT_URL` and set it to your FRONTEND URL, **with no trailing slash**:

   ```
   https://myseat.vercel.app
   ```

   You can list several addresses separated by commas, e.g. to also allow a Vercel preview URL:

   ```
   https://myseat.vercel.app,https://myseat-git-main-yourname.vercel.app
   ```

2. Save. Render restarts the service with the new value (about a minute).

If you skip this step, the site loads but every request fails, and the browser console says something like "blocked by CORS policy: No 'Access-Control-Allow-Origin' header".

---

## 5. Seed the production database

The new database is empty. You can fill it with the sample data (3 organisers, 5 users, 10 events) by running the seed script **on your own computer**, pointed at the production database.

> **Warning:** the seed script **deletes all users, events, seats and bookings** in the database it connects to before adding the sample data. Only do this on a new database, or one where you don't mind losing everything. Double-check the database name at the end of the connection string.

Setting `MONGO_URI` in the terminal overrides the value in `server/.env` for that one command.

**macOS / Linux / Git Bash:**

```bash
cd server
MONGO_URI="your-production-connection-string" npm run seed
```

**Windows PowerShell:**

```powershell
cd server
$env:MONGO_URI = "your-production-connection-string"; npm run seed; Remove-Item Env:MONGO_URI
```

You should see:

```
Organisers created: 3
Users created:      5
Events created:     10
Seats created:      1000
```

All sample accounts use the password `Password123!`, e.g. `arjun@example.com` (user) and `asha@example.com` (organiser). Anyone who reads the README knows this password, so for a public demo, change these accounts or create your own instead.

---

## 6. Final check

Open your FRONTEND URL and try the whole flow:

- [ ] The events list loads (the first visit may show the "waking up" notice)
- [ ] Refreshing on an event page (`/events/...`) still works
- [ ] Sign up, log out, log in
- [ ] Pick seats, hold them, pay and confirm, and see the ticket
- [ ] My bookings shows the booking, and Cancel works
- [ ] Log in as `asha@example.com`: the Organiser page lists events, and creating an event works

---

## Updating the live site

Push to `main`. Render and Vercel both redeploy automatically. GitHub Actions (`.github/workflows/ci.yml`) runs the server tests and the client build on every push and pull request, so check its result first: a red cross means something broke.

## Troubleshooting

| Problem                                              | Likely cause and fix                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Render log: `MongoServerSelectionError` / timeout    | Atlas Network Access doesn't allow `0.0.0.0/0` (step 1.2)                             |
| Render log: `bad auth : authentication failed`       | Wrong password in `MONGO_URI`, or special characters not URL-encoded (step 1.3)       |
| Site loads, but nothing works; CORS error in console | `CLIENT_URL` on Render doesn't match the Vercel address exactly (step 4)              |
| Requests go to `localhost:5000`                      | `VITE_API_URL` missing on Vercel, or set after the last build: redeploy (step 3)      |
| `/events/123` shows a 404 after refresh              | `client/vercel.json` is missing, or the Root Directory isn't `client`                 |
| First request takes ~1 minute                        | Normal on Render's free plan: it was asleep (step 2.4)                                |
| `429 Too many login or sign-up attempts`             | Rate limit (20 per 15 minutes per IP). Wait, or it resets when the free server sleeps |
| Logged out right after logging in                    | `JWT_EXPIRES_IN` is very short, or `JWT_SECRET` changed (which logs everyone out)     |
