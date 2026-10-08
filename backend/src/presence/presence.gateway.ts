import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence.service';

// Reads the access_token cookie out of a raw "Cookie" header without
// pulling in a separate cookie-parsing dependency -- socket.io's
// handshake doesn't go through Express's cookie-parser middleware.
function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:5173',
      'https://virtual-patrol-platform-6bfc.vercel.app',
    ],
    credentials: true,
  },
})
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private presence: PresenceService,
  ) {}

  async handleConnection(client: Socket) {
    const token = readCookie(client.handshake.headers.cookie, 'access_token');
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true },
      });
      if (!user || user.status !== 'ACTIVE') {
        client.disconnect();
        return;
      }
      client.data.userId = user.id;
      this.presence.addConnection(user.id, client.id);
      this.server.emit('presence', this.presence.getOnlineUserIds());
    } catch {
      // expired/invalid token -- reject the socket, REST calls will also
      // be failing for this client so they'll be prompted to log in again
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    const wentOffline = this.presence.removeConnection(userId, client.id);
    if (wentOffline) {
      this.server.emit('presence', this.presence.getOnlineUserIds());
    }
  }
}