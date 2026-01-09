export function decodeTick24(raw) {
  const x = Number(raw & 0xffffffn);
  return x >= 0x800000 ? x - 0x1000000 : x;
}

export function decodeTicks(infoValue) {
  const v = BigInt(infoValue);
  const tickLowerRaw = (v >> 8n) & 0xffffffn;
  const tickUpperRaw = (v >> 32n) & 0xffffffn;
  return {
    tickLower: decodeTick24(tickLowerRaw),
    tickUpper: decodeTick24(tickUpperRaw),
  };
}

export function padSaltFromTokenId(tokenId) {
  const hex = BigInt(tokenId).toString(16).padStart(64, "0");
  return "0x" + hex;
}
