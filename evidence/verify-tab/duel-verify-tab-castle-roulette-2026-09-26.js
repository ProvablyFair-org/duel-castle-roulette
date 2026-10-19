// Code written in javascript

// User input values
const serverSeed = '';
const drandSeed = '';

// Converts a hex string (e.g. "deadbeef") into a Uint8Array of bytes
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Converts a Uint8Array of bytes back into a hex string (e.g. [222, 173, 190, 239] → "deadbeef")
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Computes a HMAC-SHA256 using the Web Crypto API
// keyHex: hex-encoded key (e.g. server seed)
// message: Uint8Array to be signed
async function generateHMAC_SHA256(keyHex, message) {
  const keyBytes = hexToBytes(keyHex);

  // Import raw key for HMAC use
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Generate HMAC signature
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return bytesToHex(new Uint8Array(signature)); // Return signature as hex
}

// Converts a hex-encoded public seed into a UTF-8 string
function hexToUtf8String(publicSeed) {
  const bytes = hexToBytes(publicSeed);
  return new TextDecoder('utf-8').decode(bytes);
}

const RANGE = 48; // 0-47 inclusive

// The actual fairness verification function
const validateRouletteResult = async (drandSeed) => {
    const nonce = 0;
    const randomness = hexToUtf8String(drandSeed);
    // Prepare input message for HMAC: public seed + nonce
    const message = new TextEncoder().encode(`${randomness}:${nonce}`);

    // Compute HMAC hash
    const hash = await generateHMAC_SHA256(serverSeed, message);

    const value = parseInt(hash.slice(0, 8), 16);
    return (value % RANGE).toString();
}

// Run the validateRouletteResult function if input values are provided
if (serverSeed && serverSeed.trim() !== '' && drandSeed && drandSeed.trim() !== '') {
    validateRouletteResult(drandSeed).then(result => {
        console.log("Roll result:", result);
    });
} else {
    console.log("Please provide valid serverSeed, clientSeed, and nonce (>=0) before running.");
}
