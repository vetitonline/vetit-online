export function canAddPreviewProduct(product) {
  return Boolean(product && typeof product.id === 'string' && product.id && !product.priceIsFrom && product.currencyCode === 'INR' && Number.isSafeInteger(product.priceMinor) && product.priceMinor > 0);
}
export function changePreviewCart(lines, { action, product, id, quantity }) {
  if (action === 'remove') return lines.filter(line => line.product.id !== id);
  if (action === 'quantity') {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('Choose a quantity from 1 to 99.');
    return lines.map(line => line.product.id === id ? { ...line, quantity } : line);
  }
  if (action !== 'add' || !canAddPreviewProduct(product)) throw new Error('Choose a product with a confirmed INR price; variant options must be selected online.');
  const existing = lines.find(line => line.product.id === product.id);
  if (!existing && lines.length >= 50) throw new Error('The preview cart supports up to 50 products.');
  return existing ? lines.map(line => line.product.id === product.id ? { product, quantity: Math.min(99, line.quantity + 1) } : line) : [...lines, { product, quantity: 1 }];
}
export function previewCartSubtotal(lines) {
  let total = 0;
  for (const line of lines) {
    if (!canAddPreviewProduct(line.product) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) return null;
    total += line.product.priceMinor * line.quantity;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}
