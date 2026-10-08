import { io, Socket } from 'socket.io-client'
import { API_BASE_URL } from './api'

// Single shared socket for the whole app. Connected once the user is
// authenticated (see AuthContext) and disconnected on logout, rather than
// per-page -- this is what lets the "online" dot reflect being logged in
// anywhere in the app, not just while viewing the Logs page.
let socket: Socket | null = null

export function connectSocket(): Socket {
  if (socket?.connected) return socket
  socket = io(API_BASE_URL, {
    withCredentials: true, // sends the access_token cookie for auth
    autoConnect: true,
  })
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}

export function getSocket(): Socket | null {
  return socket
}