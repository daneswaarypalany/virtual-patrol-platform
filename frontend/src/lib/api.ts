import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:3000',
  withCredentials: true, // send the HTTP-only auth cookie on every request
});