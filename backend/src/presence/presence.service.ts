import { Injectable } from '@nestjs/common';

// Tracks which userIds currently have at least one open socket connection.
// A user can have several sockets open (multiple tabs/devices), so we keep
// a set of socket ids per user and only consider them offline once the
// last one disconnects.
@Injectable()
export class PresenceService {
  private socketsByUser = new Map<string, Set<string>>();

  addConnection(userId: string, socketId: string) {
    const existing = this.socketsByUser.get(userId);
    if (existing) {
      existing.add(socketId);
    } else {
      this.socketsByUser.set(userId, new Set([socketId]));
    }
  }

  // Returns the userId that just went offline (last socket closed), or
  // null if that user still has other sockets open / was never tracked.
  removeConnection(userId: string, socketId: string): string | null {
    const existing = this.socketsByUser.get(userId);
    if (!existing) return null;
    existing.delete(socketId);
    if (existing.size === 0) {
      this.socketsByUser.delete(userId);
      return userId;
    }
    return null;
  }

  isOnline(userId: string): boolean {
    return this.socketsByUser.has(userId);
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.socketsByUser.keys());
  }
}