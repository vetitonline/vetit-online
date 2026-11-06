export class ProfileError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** A display name is contact information, never an authorization role. */
export function normalizeProfileUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 1 || !Object.hasOwn(input, 'fullName') ||
      typeof input.fullName !== 'string') {
    throw new ProfileError('Provide only your display name.');
  }
  const fullName = input.fullName.trim().normalize('NFC');
  if (!fullName || [...fullName].length > 100 || /[\u0000-\u001f\u007f-\u009f]/u.test(fullName)) {
    throw new ProfileError('Enter a display name of 1–100 characters without control characters.');
  }
  return { full_name: fullName };
}

export function normalizeProfile(row) {
  if (!row || typeof row.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) ||
      !(row.full_name === null || typeof row.full_name === 'string')) {
    throw new ProfileError('Account returned an invalid response.', 503);
  }
  return { id: row.id, fullName: row.full_name };
}
