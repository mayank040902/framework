import { encode, decode } from "notepack.io";
import {
  generateKeyPair,
  computeSharedKey,
  encryptWithSharedKey,
  toBase64,
  fromBase64,
  keyFromHex,
  decrypt,
  type KeyPair,
  type SharedKeyData,
} from "./e2ee.js";

declare global {
  interface WebSocket {
    id?: string;
  }
}

export interface Client {
  id: string;
  socket: WebSocket;
  metadata?: Record<string, unknown>;
}

export interface BroadcastOptions {
  except?: string[];
}

export interface Channel {
  name: string;
  members: Map<string, Client>;
}

export class RealtimeHub {
  private channels: Map<string, Map<string, Client>> = new Map();
  private clients: Map<string, Client> = new Map();
  private e2eeEnabled = false;
  private hubKeyPair: KeyPair | null = null;
  private sharedKeys: Map<string, SharedKeyData> = new Map();

  enableE2EE(): void {
    this.e2eeEnabled = true;
    this.hubKeyPair = generateKeyPair();
    this.sharedKeys = new Map();
  }

  getPublicKey(): Buffer | null {
    if (!this.e2eeEnabled || !this.hubKeyPair) {
      return null;
    }
    return this.hubKeyPair.publicKey;
  }

  registerClientKey(clientId: string, publicKey: Buffer): Buffer | null {
    if (!this.e2eeEnabled || !this.hubKeyPair) {
      return null;
    }
    const sharedKey = computeSharedKey(publicKey, this.hubKeyPair.privateKey);
    this.sharedKeys.set(clientId, { publicKey, sharedKey });
    return this.hubKeyPair.publicKey;
  }

  unregisterClientKey(clientId: string): void {
    this.sharedKeys.delete(clientId);
  }

  ensureChannel(name: string): Map<string, Client> {
    if (!this.channels.has(name)) {
      this.channels.set(name, new Map());
    }
    return this.channels.get(name)!;
  }

  join(channelName: string, client: Client): void {
    this.ensureChannel(channelName).set(client.id, client);
    this.clients.set(client.id, client);
  }

  leave(channelName: string, clientId: string): void {
    const members = this.channels.get(channelName);
    if (!members) {
      return;
    }
    members.delete(clientId);
    if (members.size === 0) {
      this.channels.delete(channelName);
    }
    this.unregisterClientKey(clientId);
    this.clients.delete(clientId);
  }

  send(target: Client | WebSocket, message: unknown): void {
    const socket = "socket" in target ? target.socket : target;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(encode(message));
    }
  }

  sendEncrypted(target: Client | WebSocket, message: unknown): void {
    const socket = "socket" in target ? target.socket : target;
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const clientId = socket.id;
    if (!clientId) {
      socket.send(encode({ type: "error", message: "Client ID not available" }));
      return;
    }
    const keyData = this.sharedKeys.get(clientId);

    if (!keyData) {
      socket.send(encode({ type: "error", message: "E2EE key not established" }));
      return;
    }

    const encrypted = encryptWithSharedKey(encode(message), keyData.sharedKey);
    socket.send(encode({ type: "e2ee", ciphertext: toBase64(encrypted) }));
  }

  broadcast(channelName: string, message: unknown, options: BroadcastOptions = {}): number {
    const payload = encode(message);
    const members = this.channels.get(channelName);
    if (!members) {
      return 0;
    }
    let sent = 0;
    for (const [clientId, client] of members) {
      if (options.except?.includes(clientId)) {
        continue;
      }
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(payload);
        sent++;
      }
    }
    return sent;
  }

  broadcastEncrypted(channelName: string, message: unknown, options: BroadcastOptions = {}): number {
    if (!this.e2eeEnabled) {
      return this.broadcast(channelName, message, options);
    }

    const members = this.channels.get(channelName);
    if (!members) {
      return 0;
    }

    const encoded = encode(message);
    let sent = 0;

    for (const [clientId, client] of members) {
      if (options.except?.includes(clientId)) {
        continue;
      }
      if (client.socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      const keyData = this.sharedKeys.get(clientId);
      if (!keyData) {
        continue;
      }

      const encrypted = encryptWithSharedKey(encoded, keyData.sharedKey);
      client.socket.send(encode({ type: "e2ee", ciphertext: toBase64(encrypted) }));
      sent++;
    }

    return sent;
  }

  participants(channelName: string): Client[] {
    return [...(this.channels.get(channelName)?.values() ?? [])];
  }

  channelCount(channelName: string): number {
    return this.channels.get(channelName)?.size ?? 0;
  }

  totalSubscribers(): number {
    let total = 0;
    for (const members of this.channels.values()) {
      total += members.size;
    }
    return total;
  }

  close(): void {
    for (const members of this.channels.values()) {
      for (const client of members.values()) {
        try {
          client.socket.close();
        } catch {
          // Socket may already be closed.
        }
      }
    }
    this.channels.clear();
    this.clients.clear();
    this.sharedKeys.clear();
  }
}

export function broadcastPublicInteraction(
  hub: RealtimeHub,
  recordId: string,
  interaction: unknown
): number {
  const channelName = `interactions:${recordId}`;
  const globalChannel = `interactions:global`;
  const message = {
    type: "interaction",
    recordId,
    data: interaction,
    timestamp: Date.now(),
  };
  hub.broadcast(channelName, message);
  hub.broadcast(globalChannel, message);
  return hub.channelCount(channelName) + hub.channelCount(globalChannel);
}

export function decodeMessage(buffer: Buffer): unknown {
  return decode(buffer);
}

export function decryptMessage(
  ciphertextBase64: string,
  senderPublicKeyHex: string,
  recipientPrivateKey: Buffer
): Buffer {
  const ciphertext = fromBase64(ciphertextBase64);
  const senderPublicKey = keyFromHex(senderPublicKeyHex);
  return decrypt(ciphertext, senderPublicKey, recipientPrivateKey);
}