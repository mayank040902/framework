import sodium from "libsodium-wrappers";

let ready = false;
sodium.ready.then(() => {
  ready = true;
});

function assertReady(): void {
  if (!ready) {
    throw new Error("libsodium is not ready yet");
  }
}

export interface KeyPair {
  publicKey: Buffer;
  privateKey: Buffer;
}

export interface SharedKeyData {
  publicKey: Buffer;
  sharedKey: Buffer;
}

export function generateKeyPair(): KeyPair {
  assertReady();
  const keyPair = sodium.crypto_box_keypair();
  return {
    publicKey: Buffer.from(keyPair.publicKey),
    privateKey: Buffer.from(keyPair.privateKey),
  };
}

export function generateSigningKeyPair(): KeyPair {
  assertReady();
  const keyPair = sodium.crypto_sign_keypair();
  return {
    publicKey: Buffer.from(keyPair.publicKey),
    privateKey: Buffer.from(keyPair.privateKey),
  };
}

export function encrypt(
  message: Buffer,
  recipientPublicKey: Buffer,
  senderPrivateKey: Buffer
): Buffer {
  assertReady();
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const ciphertext = sodium.crypto_box_easy(
    message,
    nonce,
    recipientPublicKey,
    senderPrivateKey,
  );
  return Buffer.concat([nonce, Buffer.from(ciphertext)]);
}

export function decrypt(
  ciphertext: Buffer,
  senderPublicKey: Buffer,
  recipientPrivateKey: Buffer
): Buffer {
  assertReady();
  const nonce = ciphertext.slice(0, sodium.crypto_box_NONCEBYTES);
  const message = ciphertext.slice(sodium.crypto_box_NONCEBYTES);
  return Buffer.from(
    sodium.crypto_box_open_easy(
      message,
      nonce,
      senderPublicKey,
      recipientPrivateKey,
    ),
  );
}

export function sign(message: Buffer, privateKey: Buffer): Buffer {
  assertReady();
  const signed = sodium.crypto_sign(message, privateKey);
  return Buffer.from(signed);
}

export function verify(signedMessage: Buffer, publicKey: Buffer): Buffer {
  assertReady();
  return Buffer.from(
    sodium.crypto_sign_open(signedMessage, publicKey),
  );
}

export function computeSharedKey(recipientPublicKey: Buffer, senderPrivateKey: Buffer): Buffer {
  assertReady();
  return Buffer.from(
    sodium.crypto_box_beforenm(recipientPublicKey, senderPrivateKey),
  );
}

export function encryptWithSharedKey(message: Buffer, sharedKey: Buffer): Buffer {
  assertReady();
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const ciphertext = sodium.crypto_box_easy_afternm(message, nonce, sharedKey);
  return Buffer.concat([nonce, Buffer.from(ciphertext)]);
}

export function decryptWithSharedKey(ciphertext: Buffer, sharedKey: Buffer): Buffer {
  assertReady();
  const nonce = ciphertext.slice(0, sodium.crypto_box_NONCEBYTES);
  const message = ciphertext.slice(sodium.crypto_box_NONCEBYTES);
  return Buffer.from(
    sodium.crypto_box_open_easy_afternm(message, nonce, sharedKey),
  );
}

export function toBase64(buffer: Buffer): string {
  return Buffer.from(buffer).toString("base64");
}

export function fromBase64(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

export function keyToHex(buffer: Buffer): string {
  return Buffer.from(buffer).toString("hex");
}

export function keyFromHex(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}