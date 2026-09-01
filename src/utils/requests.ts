import { GM_cookie, GM_xmlhttpRequest, GmXhrRequest } from "$";

import { logger } from "./logger";

export class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "请求错误";
  }
}

export type ResponseType = "text" | "json" | "arraybuffer" | "blob" | "document" | "stream";
export type OnStream = (reader: ReadableStreamDefaultReader<Uint8Array>) => void;
export type RequestArgs<TContext, TResponseType extends ResponseType> = Partial<
  Pick<
    GmXhrRequest<TContext, TResponseType>,
    "method" | "url" | "data" | "headers" | "timeout" | "responseType"
  > & {
    onStream: OnStream;
    cookie: boolean;
    signal: AbortSignal;
  }
>;
type ResolvedReturnType<T extends (...args: any) => any> =
  ReturnType<T> extends Promise<infer R> ? R : ReturnType<T>;

export function request<TContext, TResponseType extends ResponseType = "json">({
  method = "POST",
  url = "",
  data = undefined,
  headers = {},
  timeout = 5,
  responseType = "json" as TResponseType,
  onStream = () => {},
  cookie = true,
  signal,
}: RequestArgs<TContext, TResponseType>) {
  headers["Referer"] = window.location.href;
  headers["User-Agent"] = window.navigator.userAgent;
  return new Promise<TContext>((resolve, reject) => {
    let abortRequest: (() => void) | null = null;
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(signal?.reason || new RequestError("用户中止"));
      abortRequest?.();
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    void (async () => {
      try {
        const ck = cookie
          ? await new Promise<ResolvedReturnType<(typeof GM_cookie)["list"]>>((resolve, reject) =>
              GM_cookie.list({}, (ck, err) => {
                if (err) {
                  reject(err);
                }
                resolve(ck);
              }),
            )
          : [];
        if (signal?.aborted) {
          abort();
          return;
        }
        // 请求日志已禁用
        const xhr = GM_xmlhttpRequest<TContext, TResponseType>({
          method,
          url,
          data,
          headers,
          timeout: timeout * 1000,
          responseType,
          cookie: ck.map((c) => `${c.name}=${c.value}`).join("; "),

          ontimeout() {
            cleanup();
            reject(new RequestError(`超时 ${Math.round(timeout)}s`));
          },
          onabort() {
            cleanup();
            reject(new RequestError("用户中止"));
          },
          onerror(e) {
            cleanup();
            const msg = `${e.responseText} | ${e.error}`;
            reject(new RequestError(msg));
          },
          onloadend(e) {
            cleanup();
            resolve(e.response);
          },
          onloadstart(e) {
            if (responseType === "stream") {
              const reader = (e.response as ReadableStream<Uint8Array>).getReader();
              onStream(reader);
            }
          },
        });
        abortRequest = () => xhr.abort();
      } catch (err) {
        cleanup();
        reject(err);
      }
    })();
  });
}

request.post = <TContext, TResponseType extends ResponseType = "json">(
  args: Omit<RequestArgs<TContext, TResponseType>, "method">,
) => {
  return request<TContext, TResponseType>({
    method: "POST",
    ...args,
  });
};

request.get = <TContext, TResponseType extends ResponseType = "json">(
  args: Omit<RequestArgs<TContext, TResponseType>, "method">,
) => {
  return request<TContext, TResponseType>({
    method: "GET",
    ...args,
  });
};
