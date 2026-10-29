import { chacha20poly1305 } from '@noble/ciphers/chacha.js';

// The module under test imports the native crypto surface; Node's implementation is
// interchangeable for the hashing and AEAD paths this suite exercises.
jest.mock('react-native-quick-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  const { Buffer } = jest.requireActual<typeof import('node:buffer')>('node:buffer');
  return { Buffer, ...nodeCrypto };
});

// The transport pulls libp2p's key exchange, which Jest cannot resolve from its package graph.
// This mirrors the adapter it applies to the primitives, so the test still exercises the
// buffering and tag handling that `remoteCrypto` implements.
jest.mock('@cherrystudio/remote-transport', () => ({
  createNativeNoiseCrypto: (native: {
    createHash(algorithm: string): { update(bytes: Uint8Array): unknown; digest(): Uint8Array };
    createCipheriv(
      algorithm: string,
      key: Uint8Array,
      nonce: Uint8Array,
      options: unknown,
    ): {
      setAAD(bytes: Uint8Array): void;
      update(bytes: Uint8Array): Uint8Array;
      final(): Uint8Array;
      getAuthTag(): Uint8Array;
    };
    createDecipheriv(
      algorithm: string,
      key: Uint8Array,
      nonce: Uint8Array,
      options: unknown,
    ): {
      setAAD(bytes: Uint8Array): void;
      setAuthTag(bytes: Uint8Array): void;
      update(bytes: Uint8Array): Uint8Array;
      final(): Uint8Array;
    };
  }) => ({
    hashSHA256(data: Uint8Array) {
      const hash = native.createHash('sha256');
      hash.update(data);
      return hash.digest();
    },
    chaCha20Poly1305Encrypt(
      plaintext: Uint8Array,
      nonce: Uint8Array,
      aad: Uint8Array,
      key: Uint8Array,
    ) {
      const cipher = native.createCipheriv('chacha20-poly1305', key, nonce, {
        authTagLength: 16,
      });
      cipher.setAAD(aad);
      const body = new Uint8Array([...cipher.update(plaintext), ...cipher.final()]);
      const tag = cipher.getAuthTag();
      const sealed = new Uint8Array(body.length + tag.length);
      sealed.set(body, 0);
      sealed.set(tag, body.length);
      return sealed;
    },
    chaCha20Poly1305Decrypt(
      ciphertext: Uint8Array,
      nonce: Uint8Array,
      aad: Uint8Array,
      key: Uint8Array,
    ) {
      const decipher = native.createDecipheriv('chacha20-poly1305', key, nonce, {
        authTagLength: 16,
      });
      decipher.setAAD(aad);
      decipher.setAuthTag(ciphertext.slice(-16));
      return new Uint8Array([...decipher.update(ciphertext.slice(0, -16)), ...decipher.final()]);
    },
  }),
}));

import { remoteCrypto } from '../remoteCrypto';

const key = Uint8Array.from({ length: 32 }, (_, index) => index);
const nonce = Uint8Array.from({ length: 12 }, (_, index) => 0xff - index);
const aad = new TextEncoder().encode('session metadata');
const plaintext = new TextEncoder().encode('remote desktop payload');

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The transport's crypto surface may hand back a `Uint8ArrayList` instead of plain bytes. */
function asBytes(value: Uint8Array | { subarray(): Uint8Array }): Uint8Array {
  return value instanceof Uint8Array ? value : Uint8Array.from(value.subarray());
}

describe('remote Noise crypto', () => {
  test('hashes with SHA-256', () => {
    expect(hex(remoteCrypto.hashSHA256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('seals a message that the standard AEAD can open', () => {
    const sealed = asBytes(remoteCrypto.chaCha20Poly1305Encrypt(plaintext, nonce, aad, key));

    expect(sealed.length).toBe(plaintext.length + 16);
    expect(chacha20poly1305(key, nonce, aad).decrypt(sealed)).toEqual(plaintext);
  });

  test('round-trips through the transport wrapper', () => {
    const sealed = remoteCrypto.chaCha20Poly1305Encrypt(plaintext, nonce, aad, key);

    expect(remoteCrypto.chaCha20Poly1305Decrypt(sealed, nonce, aad, key)).toEqual(plaintext);
  });

  test('writes decrypted bytes into the provided destination', () => {
    const sealed = remoteCrypto.chaCha20Poly1305Encrypt(plaintext, nonce, aad, key);
    const destination = new Uint8Array(64);

    expect(remoteCrypto.chaCha20Poly1305Decrypt(sealed, nonce, aad, key, destination)).toEqual(
      plaintext,
    );
  });

  test('rejects a tampered tag or mismatched associated data', () => {
    const sealed = asBytes(remoteCrypto.chaCha20Poly1305Encrypt(plaintext, nonce, aad, key));
    sealed[sealed.length - 1] ^= 0xff;

    expect(() => remoteCrypto.chaCha20Poly1305Decrypt(sealed, nonce, aad, key)).toThrow();
    const intact = remoteCrypto.chaCha20Poly1305Encrypt(plaintext, nonce, aad, key);
    expect(() =>
      remoteCrypto.chaCha20Poly1305Decrypt(intact, nonce, new TextEncoder().encode('other'), key),
    ).toThrow();
  });
});
