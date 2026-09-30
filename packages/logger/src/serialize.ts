import serializers from "pino-std-serializers";

const { err, req: serializeReq, res: serializeRes } = serializers;

export interface SerializerOptions {
    excludeQuery?: boolean;
    excludeHeaders?: boolean;
    excludeQueryString?: boolean;
}

export interface CustomRequest {
    method?: string;
    url?: string;
    host?: string;
    hostname?: string;
    headers?: Record<string, string | string[] | undefined>;
    remoteAddress?: string;
    remotePort?: number;
    protocol?: string;
    queryString?: string;
    query?: Record<string, unknown>;
    id?: string | number;
    socket?: { remoteAddress?: string; remotePort?: number };
}

export interface CustomResponse {
    statusCode?: number;
    headers?: Record<string, string | string[] | undefined>;
}

function splitUrl(url: string | undefined): {
    path: string | undefined;
    queryString: string | undefined;
} {
    if (typeof url !== "string") {
        return { path: url, queryString: undefined };
    }

    const index = url.indexOf("?");

    if (index === -1) {
        return { path: url, queryString: undefined };
    }

    return {
        path: url.slice(0, index),
        queryString: url.slice(index + 1),
    };
}

export function createSerializers(
    options: SerializerOptions = {},
) {
    const {
        excludeQuery = false,
        excludeHeaders = false,
        // Defaults to stripping the query string: it is a common place for
        // tokens and passwords, and the `query` object is still logged (with
        // sensitive keys redacted). Pass `false` to keep the raw string.
        excludeQueryString = true,
    } = options;

    return {
        err,

        req(request: CustomRequest) {
            const serialized = serializeReq(request as Parameters<typeof serializeReq>[0]);

            const {
                query: _query,
                headers: _headers,
                ...base
            } = serialized;

            const socket = request.socket;

            const headerHost = request.headers?.host;
            // A host header may legally repeat; take the first value rather
            // than emitting an array into the `host` field.
            const hostFromHeaders = Array.isArray(headerHost)
                ? headerHost[0]
                : headerHost;

            // `request.host` is absent on raw Node requests, where the host
            // lives in the headers; fall back so the field is never lost.
            const host = request.host
                ?? request.hostname
                ?? hostFromHeaders;

            // The std serializer resolves the URL across frameworks: Express
            // exposes `originalUrl`, hapi/Fastify expose `url.path`, and a raw
            // Node request uses `url`. Falling back to `request.url` alone would
            // drop the original path and could emit the url object verbatim.
            //
            // When the std serializer resolves nothing (a degenerate empty url,
            // or an unrecognised framework object) fall back to a *string*
            // `request.url` rather than dropping the field. The guard matters:
            // hapi exposes `url` as an object, and emitting that verbatim would
            // be worse than omitting it. Fails closed either way, because the
            // query string is split off whatever string is resolved here.
            const resolvedUrl = typeof serialized.url === "string"
                ? serialized.url
                : typeof request.url === "string"
                    ? request.url
                    : undefined;

            const queryString = request.queryString
                ?? splitUrl(resolvedUrl).queryString;

            const { path: urlWithoutQuery } = splitUrl(resolvedUrl);

            const result: Record<string, unknown> = {
                ...base,

                method: request.method ?? base.method,
                // Drop the query string from the logged URL when requested so
                // secrets embedded in it are not written to the sink.
                url: excludeQueryString ? urlWithoutQuery : resolvedUrl,

                host,
                hostname: request.hostname,

                correlationId: request.headers?.["x-correlation-id"],

                remoteAddress: request.remoteAddress ?? socket?.remoteAddress,
                remotePort: request.remotePort ?? socket?.remotePort,

                protocol: request.protocol,
            };

            // Stripping only the URL is not enough: the raw `queryString`
            // field would otherwise carry the same secrets to the sink.
            // An empty query string carries no information; skip it rather
            // than emitting `"queryString":""` on every request.
            if (!excludeQueryString && queryString) {
                result.queryString = queryString;
            }

            if (!excludeHeaders && request.headers) {
                result.headers = request.headers as Record<string, string>;
            }

            if (!excludeQuery) {
                const query = serialized.query ?? request.query;
                // Only emit `query` when it carries data; the std serializer
                // returns an empty string for query-less requests.
                if (query && (typeof query !== "object" || Object.keys(query).length > 0)) {
                    result.query = query;
                }
            }

            return result;
        },

        res(response: CustomResponse) {
            const serialized = serializeRes(response as Parameters<typeof serializeRes>[0]);

            const {
                headers: serializedHeaders,
                statusCode: _statusCode,
                ...base
            } = serialized;

            const result: Record<string, unknown> = {
                ...base,
            };

            // The std serializer yields `statusCode: null` when headers have
            // not been sent yet; emitting an explicit null is noise, so keep
            // the field absent unless a real status code is known.
            const statusCode = response.statusCode ?? _statusCode;
            if (statusCode !== undefined && statusCode !== null) {
                result.statusCode = statusCode;
            }

            if (!excludeHeaders) {
                // The std serializer already reads `getHeaders()` for a raw
                // Node response, where `response.headers` does not exist;
                // prefer the explicit value when one was supplied.
                const headers = response.headers ?? serializedHeaders;

                if (headers && Object.keys(headers).length > 0) {
                    result.headers = headers as Record<string, string>;
                }
            }

            return result;
        },
    };
}
