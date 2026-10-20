import { sellerImageExtension } from './validation.js';
export function validateSellerImageSelection(files, remainingSlots) {
  if (!Number.isInteger(remainingSlots) || remainingSlots < 0 || remainingSlots > 5 || files.length > remainingSlots) return 'Too many photos for the remaining image slots.';
  if (files.some(file => !sellerImageExtension(file.type) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 5 * 1024 * 1024)) return 'Choose JPEG, PNG, WebP or AVIF photos between 1 byte and 5 MB each.';
  return null;
}
