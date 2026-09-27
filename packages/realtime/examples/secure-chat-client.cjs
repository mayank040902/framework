const WS_URL = process.env.WS_URL || "ws://localhost:3004/ws/secure-chat";

const WebSocket = require('ws');
const sodium = require('libsodium-wrappers');

const ws = new WebSocket(WS_URL);
let myClientId = null;
let myKeyPair = null;
let serverPublicKey = null;
let sharedKey = null;

async function initSodium() {
  await sodium.ready;
}

function generateKeyPair() {
  const keyPair = sodium.crypto_box_keypair();
  return { 
    publicKey: Buffer.from(keyPair.publicKey),
    privateKey: Buffer.from(keyPair.privateKey)
  };
}

function toBase64(buf) {
  return buf.toString('base64');
}

function fromBase64(str) {
  return Buffer.from(str, 'base64');
}

function computeSharedKey(theirPublicKey, myPrivateKey) {
  return Buffer.from(sodium.crypto_box_beforenm(theirPublicKey, myPrivateKey));
}

function encrypt(plaintext, key) {
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const ciphertext = sodium.crypto_box_easy_afternm(Buffer.from(plaintext), nonce, key);
  return Buffer.concat([nonce, Buffer.from(ciphertext)]);
}

function decrypt(ciphertext, key) {
  const nonce = ciphertext.slice(0, sodium.crypto_box_NONCEBYTES);
  const encrypted = ciphertext.slice(sodium.crypto_box_NONCEBYTES);
  return Buffer.from(sodium.crypto_box_open_easy_afternm(encrypted, nonce, key)).toString();
}

ws.on('open', async () => {
  console.log("Connected to secure chat server");
  
  await initSodium();
  myKeyPair = generateKeyPair();
  
  ws.send(JSON.stringify({
    type: "clientPublicKey",
    publicKey: toBase64(myKeyPair.publicKey)
  }));
});

ws.on('message', async (data) => {
  try {
    await initSodium();
    const message = JSON.parse(data.toString());
    
    if (message.type === "welcome") {
      myClientId = message.clientId;
      serverPublicKey = fromBase64(message.serverPublicKey);
      
      sharedKey = computeSharedKey(serverPublicKey, myKeyPair.privateKey);
      
      console.log(`Welcome! Your client ID: ${myClientId}`);
      console.log("Shared key established. You can now send encrypted messages.");
      console.log("Type your message and press Enter:");
      
    } else if (message.type === "keyRegistered") {
      console.log("Key registered successfully!");
      
    } else if (message.type === "encryptedMessage") {
      if (!sharedKey) {
        console.log("No shared key yet");
        return;
      }
      
      try {
        const ciphertext = fromBase64(message.ciphertext);
        const plaintext = decrypt(ciphertext, sharedKey);
        console.log(`\n[${message.from.slice(0, 8)}]: ${plaintext}`);
        console.log("> ");
      } catch (err) {
        console.error("Failed to decrypt message:", err);
      }
    }
  } catch (err) {
    console.error("Error processing message:", err);
  }
});

ws.on('close', () => {
  console.log("\nDisconnected from server");
  process.exit(0);
});

ws.on('error', (err) => {
  console.error("Connection error:", err);
});

process.stdin.on('data', async (data) => {
  await initSodium();
  const text = data.toString().trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  
  if (!sharedKey) {
    console.log("Not ready yet - waiting for key exchange...");
    return;
  }
  
  try {
    const encrypted = encrypt(text, sharedKey);
    ws.send(JSON.stringify({
      type: "message",
      text: toBase64(encrypted)
    }));
    console.log("> ");
  } catch (err) {
    console.error("Failed to encrypt:", err);
  }
});

console.log("Connecting to secure chat...");
console.log("Press Ctrl+C to exit\n");