export function readJsonBody(request: Request, maxBytes?: number): Promise<
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 }
>;
