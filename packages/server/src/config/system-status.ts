import {
    DEFAULT_THRESHOLDS,
    getSystemStatus,
    type HealthChecks,
    type SystemMetrics,
    type SystemStatus,
    type SystemThresholds,
} from "../lib/index.js";

interface CreateHealthResponseOptions {
    runtime?: string;
    system: SystemMetrics;
    checks?: HealthChecks;
    metadata?: Record<string, unknown>;
    thresholds?: SystemThresholds;
}

export function createHealthResponse(service: string, {
    runtime,
    system,
    checks = {},
    metadata = {},
    thresholds = DEFAULT_THRESHOLDS,
}: CreateHealthResponseOptions,
) {
    const status: SystemStatus = getSystemStatus(
        system,
        checks,
        thresholds,
    );

    return {
        service,
        status,
        timestamp: new Date().toISOString(),
        runtime,
        system,
        checks,
        ...metadata,
    };
}