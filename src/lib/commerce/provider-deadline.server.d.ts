export function withProviderDeadline<T>(operation:(signal:AbortSignal)=>Promise<T>,timeoutMs:number):Promise<T>;
