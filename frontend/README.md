# E-CashEngine Frontend

Small Vite + React + TypeScript + SCSS frontend for e-CashEngine.

Routes are handled inside `src/App.tsx`:

- `/`
- `/articles`
- `/articles/:slug`
- `/admin`

The app uses `VITE_API_URL` from the project root `.env` to call the Express backend. Run `npm run setup:env` from the project root to create it from `.env.sample`.
