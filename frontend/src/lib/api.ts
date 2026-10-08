import axios from 'axios';

// Defaults to the deployed backend. To run against your local backend,
// create frontend/.env.local containing:
//   VITE_API_URL=http://localhost:3000
// and restart `npm run dev`.
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ?? 'https://virtual-patrol-platform-8ib6.vercel.app';

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send the HTTP-only auth cookie on every request
});