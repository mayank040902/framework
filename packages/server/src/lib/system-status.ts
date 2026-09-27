export type SystemStatus =
    | "healthy"
    | "degraded"
    | "unhealthy";

export interface SystemThresholds {
    memory: {
        degraded: number;
        unhealthy: number;
    };

    load: {
        degraded: number;
        unhealthy: number;
    };
}

export const DEFAULT_THRESHOLDS: SystemThresholds = {
    memory: {
        degraded: 75,
        unhealthy: 90,
    },

    load: {
        degraded: 0.7,
        unhealthy: 1,
    },
};

export interface HealthCheck {
    status: boolean;
    latency?: number;
    message?: string;
}

export type HealthChecks = Record<string, HealthCheck>;

export interface SystemMetrics {
    memory: {
        usagePercent: number;
    };

    cpu: {
        cores: number;
        loadAverage: {
            oneMinute: number;
        };
    };
}

export function getSystemStatus(
    system: SystemMetrics,
    checks: HealthChecks,
    thresholds: SystemThresholds = DEFAULT_THRESHOLDS,
): SystemStatus {
    const memoryUsage = system.memory.usagePercent;

    const normalizedLoad =
        system.cpu.cores > 0
            ? system.cpu.loadAverage.oneMinute / system.cpu.cores
            : 0;

    /*
     * Dependency failure is immediately unhealthy.
     */
    const hasFailedCheck = Object.values(checks).some(
        (check) => !check.status,
    );

    if (hasFailedCheck) {
        return "unhealthy";
    }

    /*
     * Critical resource pressure.
     */
    if (
        memoryUsage >= thresholds.memory.unhealthy ||
        normalizedLoad >= thresholds.load.unhealthy
    ) {
        return "unhealthy";
    }

    /*
     * Elevated resource pressure.
     */
    if (
        memoryUsage >= thresholds.memory.degraded ||
        normalizedLoad >= thresholds.load.degraded
    ) {
        return "degraded";
    }

    return "healthy";
}