import { describe, it, expect, beforeEach, vi } from "vitest";
import { decode } from "notepack.io";
import sodium from "libsodium-wrappers";
import { RealtimeHub, broadcastPublicInteraction } from "../src/hub.js";

await sodium.ready;

function makeSocket(id: string) {
  const messages: unknown[] = [];
  const socket = {
    id,
    readyState: 1,
    send(data: Uint8Array) {
      messages.push(decode(data));
    },
    close() {
      this.readyState = 3;
    },
    _messages: messages,
  };
  return socket;
}

describe("RealtimeHub", () => {
  it("join adds a client to a channel", () => {
    const hub = new RealtimeHub();
    const client = { id: "c1", socket: makeSocket("c1") };

    hub.join("room-1", client);

    expect(hub.channelCount("room-1")).toBe(1);
    expect(hub.participants("room-1")).toEqual([client]);
  });

  it("leave removes a client and cleans empty channels", () => {
    const hub = new RealtimeHub();
    const client = { id: "c1", socket: makeSocket("c1") };

    hub.join("room-1", client);
    hub.leave("room-1", "c1");

    expect(hub.channelCount("room-1")).toBe(0);
    expect(hub.participants("room-1").length).toBe(0);
  });

  it("leave on unknown channel is a no-op", () => {
    const hub = new RealtimeHub();

    hub.leave("nonexistent", "c1");

    expect(hub.totalSubscribers()).toBe(0);
  });

  it("broadcast sends to all members of a channel", () => {
    const hub = new RealtimeHub();
    const c1 = { id: "c1", socket: makeSocket("c1") };
    const c2 = { id: "c2", socket: makeSocket("c2") };

    hub.join("room-1", c1);
    hub.join("room-1", c2);

    const sent = hub.broadcast("room-1", { type: "hello" });

    expect(sent).toBe(2);
    expect(c1.socket._messages).toEqual([{ type: "hello" }]);
    expect(c2.socket._messages).toEqual([{ type: "hello" }]);
  });

  it("broadcast skips closed sockets", () => {
    const hub = new RealtimeHub();
    const c1 = { id: "c1", socket: makeSocket("c1") };
    const c2 = { id: "c2", socket: makeSocket("c2") };
    c2.socket.readyState = 3;

    hub.join("room-1", c1);
    hub.join("room-1", c2);

    const sent = hub.broadcast("room-1", { type: "hello" });

    expect(sent).toBe(1);
    expect(c1.socket._messages).toEqual([{ type: "hello" }]);
  });

  it("broadcast excludes specified client IDs", () => {
    const hub = new RealtimeHub();
    const c1 = { id: "c1", socket: makeSocket("c1") };
    const c2 = { id: "c2", socket: makeSocket("c2") };

    hub.join("room-1", c1);
    hub.join("room-1", c2);

    const sent = hub.broadcast("room-1", { type: "hello" }, { except: ["c1"] });

    expect(sent).toBe(1);
    expect(c1.socket._messages.length).toBe(0);
    expect(c2.socket._messages).toEqual([{ type: "hello" }]);
  });

  it("broadcast on empty channel returns 0", () => {
    const hub = new RealtimeHub();

    const sent = hub.broadcast("room-1", { type: "hello" });

    expect(sent).toBe(0);
  });

  it("send delivers to a single socket", () => {
    const hub = new RealtimeHub();
    const socket = makeSocket("c1");

    hub.send(socket, { type: "pong" });

    expect(socket._messages).toEqual([{ type: "pong" }]);
  });

  it("send accepts a client object with a socket property", () => {
    const hub = new RealtimeHub();
    const client = { id: "c1", socket: makeSocket("c1") };

    hub.send(client, { type: "pong" });

    expect(client.socket._messages).toEqual([{ type: "pong" }]);
  });

  it("send skips closed sockets", () => {
    const hub = new RealtimeHub();
    const socket = makeSocket("c1");
    socket.readyState = 3;

    hub.send(socket, { type: "pong" });

    expect(socket._messages.length).toBe(0);
  });

  it("totalSubscribers counts across all channels", () => {
    const hub = new RealtimeHub();
    hub.join("room-1", { id: "c1", socket: makeSocket("c1") });
    hub.join("room-2", { id: "c2", socket: makeSocket("c2") });
    hub.join("room-2", { id: "c3", socket: makeSocket("c3") });

    expect(hub.totalSubscribers()).toBe(3);
  });

  it("close shuts down all sockets and clears channels", () => {
    const hub = new RealtimeHub();
    const c1 = { id: "c1", socket: makeSocket("c1") };
    const c2 = { id: "c2", socket: makeSocket("c2") };

    hub.join("room-1", c1);
    hub.join("room-2", c2);
    hub.close();

    expect(hub.totalSubscribers()).toBe(0);
    expect(hub.channelCount("room-1")).toBe(0);
    expect(hub.channelCount("room-2")).toBe(0);
    expect(c1.socket.readyState).toBe(3);
    expect(c2.socket.readyState).toBe(3);
  });

  it("broadcastPublicInteraction sends to record and global channels", () => {
    const hub = new RealtimeHub();
    const globalClient = { id: "g1", socket: makeSocket("g1") };
    const recordClient = { id: "r1", socket: makeSocket("r1") };

    hub.join("interactions:global", globalClient);
    hub.join("interactions:record-abc", recordClient);

    const reached = broadcastPublicInteraction(hub, "record-abc", {
      type: "like",
      userId: "u1",
    });

    expect(reached).toBe(2);
    expect(typeof globalClient.socket._messages[0].timestamp).toBe("number");
    expect(typeof recordClient.socket._messages[0].timestamp).toBe("number");
  });

  it("broadcastPublicInteraction returns 0 when no listeners", () => {
    const hub = new RealtimeHub();

    const reached = broadcastPublicInteraction(hub, "record-abc", { type: "like" });

    expect(reached).toBe(0);
  });

  it("enableE2EE enables encryption and exposes hub public key", () => {
    const hub = new RealtimeHub();
    hub.enableE2EE();

    expect((hub as any).e2eeEnabled).toBe(true);
    expect(Buffer.isBuffer(hub.getPublicKey())).toBe(true);
    expect(hub.getPublicKey()?.length).toBe(sodium.crypto_box_PUBLICKEYBYTES);
  });

  it("sendEncrypted delivers encrypted message to client with registered key", () => {
    const hub = new RealtimeHub();
    hub.enableE2EE();

    const clientKeyPair = sodium.crypto_box_keypair();
    const client = {
      id: "c1",
      socket: makeSocket("c1"),
      publicKey: Buffer.from(clientKeyPair.publicKey),
    };

    hub.registerClientKey(client.id, client.publicKey);
    hub.join("room-1", client);

    hub.sendEncrypted(client, { type: "secret", text: "hello" });

    expect(client.socket._messages.length).toBe(1);
    const msg = client.socket._messages[0];
    expect(msg.type).toBe("e2ee");
    expect(msg.ciphertext).toBeDefined();
  });

  it("sendEncrypted rejects client without registered key", () => {
    const hub = new RealtimeHub();
    hub.enableE2EE();

    const client = { id: "c1", socket: makeSocket("c1") };
    hub.join("room-1", client);

    hub.sendEncrypted(client, { type: "secret" });

    expect(client.socket._messages).toEqual([
      { type: "error", message: "E2EE key not established" },
    ]);
  });

  it("broadcastEncrypted skips clients without registered keys", () => {
    const hub = new RealtimeHub();
    hub.enableE2EE();

    const c1 = { id: "c1", socket: makeSocket("c1") };
    const c2KeyPair = sodium.crypto_box_keypair();
    const c2 = {
      id: "c2",
      socket: makeSocket("c2"),
      publicKey: Buffer.from(c2KeyPair.publicKey),
    };

    hub.join("room-1", c1);
    hub.registerClientKey(c2.id, c2.publicKey);
    hub.join("room-1", c2);

    const sent = hub.broadcastEncrypted("room-1", { type: "secret" });

    expect(sent).toBe(1);
    expect(c1.socket._messages.length).toBe(0);
    expect(c2.socket._messages.length).toBe(1);
    expect(c2.socket._messages[0].type).toBe("e2ee");
  });

  it("leave removes client key and channel membership", () => {
    const hub = new RealtimeHub();
    hub.enableE2EE();

    const keyPair = sodium.crypto_box_keypair();
    const client = {
      id: "c1",
      socket: makeSocket("c1"),
      publicKey: Buffer.from(keyPair.publicKey),
    };

    hub.registerClientKey(client.id, client.publicKey);
    hub.join("room-1", client);
    hub.leave("room-1", client.id);

    expect(hub.channelCount("room-1")).toBe(0);
    expect((hub as any).sharedKeys.has(client.id)).toBe(false);
  });

  it("close clears all keys and channels", () => {
    const hub = new RealtimeHub();
    hub.enableE2EE();

    const keyPair = sodium.crypto_box_keypair();
    const client = {
      id: "c1",
      socket: makeSocket("c1"),
      publicKey: Buffer.from(keyPair.publicKey),
    };

    hub.registerClientKey(client.id, client.publicKey);
    hub.join("room-1", client);
    hub.close();

    expect(hub.totalSubscribers()).toBe(0);
    expect((hub as any).sharedKeys.size).toBe(0);
  });
});