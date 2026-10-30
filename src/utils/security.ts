/**
 * Aquadro POS - Cryptographic Security & Credential Hashing
 * Enforces salted SHA-256 hashes for all employee PINs and passwords.
 * Plaintext PIN storage is strictly prohibited.
 */

export class SecurityUtil {
  /**
   * Generates a cryptographically random hexadecimal salt
   */
  public static generateSalt(length: number = 16): string {
    const array = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Validates a new PIN ensuring it is secure (4 to 8 digits) and not a banned demo/trivial PIN
   */
  public static validateNewPin(pin: string): { valid: boolean; error?: string } {
    if (!pin || typeof pin !== 'string') {
      return { valid: false, error: 'Le code PIN est obligatoire.' };
    }
    const trimmed = pin.trim();
    if (trimmed.length < 4 || trimmed.length > 8) {
      return { valid: false, error: 'Le code PIN doit comporter entre 4 et 8 chiffres.' };
    }
    if (!/^\d+$/.test(trimmed)) {
      return { valid: false, error: 'Le code PIN doit contenir uniquement des chiffres.' };
    }
    const forbidden = new Set([
      '0000', '1111', '2222', '3333', '4444',
      '5555', '6666', '7777', '8888', '9999',
      '1234', '4321', '2345', '5432', '3456',
      '6543', '4567', '7654', '5678', '8765',
      '6789', '9876', '0123', '3210',
      '12345', '123456', '1234567', '12345678',
      '00000', '000000', '11111', '111111'
    ]);
    if (forbidden.has(trimmed)) {
      return { valid: false, error: 'Code PIN trop simple ou de démonstration interdit.' };
    }
    return { valid: true };
  }

  /**
   * Checks whether a stored hash string has a valid salted SHA-256 format ("salt:64HexChars")
   */
  public static isValidSaltedSha256Hash(storedHash: string | undefined | null): boolean {
    if (!storedHash || typeof storedHash !== 'string') return false;
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, hashHex] = parts;
    if (!salt || salt.length < 8 || salt.length > 64) return false;
    if (!/^[a-zA-Z0-9_-]+$/.test(salt)) return false;
    return /^[0-9a-fA-F]{64}$/.test(hashHex);
  }

  /**
   * Checks whether a stored hash string is a valid PHC Argon2 string ("$argon2id$...")
   */
  public static isValidArgon2Hash(storedHash: string | undefined | null): boolean {
    if (!storedHash || typeof storedHash !== 'string') return false;
    return /^\$argon2(id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/=_-]+\$[A-Za-z0-9+/=_-]+$/.test(storedHash);
  }

  /**
   * Hashes a PIN or Password with a random salt using SHA-256
   * Returns formatted string: "salt:hashHex" (64 hex chars)
   */
  public static async hashCredential(credential: string, existingSalt?: string): Promise<string> {
    if (!credential || typeof credential !== 'string') {
      throw new Error('Credential to hash cannot be empty.');
    }
    const salt = existingSalt || this.generateSalt(16);
    const textToHash = `${salt}:${credential}`;

    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(textToHash);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return `${salt}:${hashHex}`;
    }

    throw new Error('WebCrypto SHA-256 (crypto.subtle) is required for secure credential hashing.');
  }

  /**
   * Verifies an input PIN against a stored "salt:hashHex" SHA-256 credential using constant-time comparison.
   * Rejects plaintext PINs, mock hashes, and malformed hash strings.
   */
  public static async verifyCredential(inputCredential: string, storedHash: string): Promise<boolean> {
    if (!inputCredential || typeof inputCredential !== 'string') {
      return false;
    }
    if (!this.isValidSaltedSha256Hash(storedHash)) {
      return false;
    }

    const [salt, expectedHash] = storedHash.split(':');
    const computed = await this.hashCredential(inputCredential, salt);
    const [, computedHash] = computed.split(':');

    if (!computedHash || computedHash.length !== expectedHash.length) {
      return false;
    }

    const a = computedHash.toLowerCase();
    const b = expectedHash.toLowerCase();
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }
}
