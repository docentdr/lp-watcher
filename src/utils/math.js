export function jsbiToBigInt(x) {
  return BigInt(x.toString());
}

export function priceToken1PerToken0({ sqrtPriceX96, dec0, dec1 }) {
  const Q192 = 2n ** 192n;
  const sp = BigInt(sqrtPriceX96);
  const ratioX192 = sp * sp;
  const SCALE = 10n ** 18n;
  const num = ratioX192 * SCALE * 10n ** BigInt(dec0);
  const den = Q192 * 10n ** BigInt(dec1);
  const pScaled = num / den;
  return Number(pScaled) / 1e18;
}
