export function completeAuthCallback(requestUrl: string, exchangeCode: (code: string) => Promise<{ error: unknown }>): Promise<Response>;
