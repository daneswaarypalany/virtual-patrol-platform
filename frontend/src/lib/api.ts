import axios from 'axios';

export const api = axios.create({
baseURL: 'https://virtual-patrol-platform-8ib6.vercel.app',
  withCredentials: true, // send the HTTP-only auth cookie on every request
});