# ClosetIQ

ClosetIQ is a fashion recommendation dashboard with a Vite frontend and a small Node API backed by a JSON store.

## Run locally

Install dependencies:

```bash
npm install
```

Start the API in one terminal:

```bash
npm run api
```

Start the frontend in a second terminal:

```bash
npm run dev
```

Open `http://127.0.0.1:5173/`.

## API

- `GET /api/health` checks service availability.
- `POST /api/auth/register` creates an account and returns a session token.
- `POST /api/auth/login` signs in with email and password.
- `GET /api/auth/me` returns the active session user.
- `POST /api/auth/logout` invalidates the active session.
- `PATCH /api/profile` updates the signed-in user's name and style signal.
- `GET /api/bootstrap` loads the profile, catalog, wardrobe, and saved items.
- `GET /api/products?q=&category=` filters catalog items.
- `POST /api/saved` toggles a saved product with `{ "productId": 1 }`.
- `POST /api/feedback` records a recommendation dismissal with `{ "productId": 1, "action": "dismiss" }`.

Persistent demo state lives in `server/store.json` and can be replaced by a database when authentication and multi-user storage are introduced.

The seeded demo account is `alex@example.com` with password `closetiq`.
