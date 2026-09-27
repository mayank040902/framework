import serializers from "pino-std-serializers";

const { err, req: serializeReq, res: serializeRes } = serializers;

export interface SerializerOptions {
    excludeQuery?: boolean;
    excludeHeaders?: boolean;
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
    socket?: { remoteAddress?: string };
}

export interface CustomResponse {
    statusCode?: number;
    headers?: Record<string, string | string[] | undefined>;
}

export function createSerializers(
    options: SerializerOptions = {},
) {
    return {
        err,

        req(request: CustomRequest) {
            const serialized = serializeReq(request as Parameters<typeof serializeReq>[0]);

            const {
                query: _query,
                headers: _headers,
                ...base
            } = serialized;

            const result: Record<string, unknown> = {
                ...base,

                method: request.method,
                url: request.url,

                host: request.host,
                hostname: request.hostname,

                correlationId: request.headers?.["x-correlation-id"],

                remoteAddress: request.remoteAddress ?? request.socket?.remoteAddress,
                remotePort: request.remotePort,

                protocol: request.protocol,
                queryString: request.queryString,
            };

            if (!options.excludeHeaders) {
                result.headers = request.headers as Record<string, string>;
            }

            if (!options.excludeQuery) {
                result.query = serialized.query;
            }

            return result;
        },

        res(response: CustomResponse) {
            const serialized = serializeRes(response as Parameters<typeof serializeRes>[0]);

            return {
                ...serialized,

                statusCode: response.statusCode,
                headers: response.headers as Record<string, string>,
            };
        },
    };
}