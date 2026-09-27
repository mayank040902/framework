import os from "node:os";
import process from "node:process";
import { performance } from "node:perf_hooks";

import { formatBytes, formatTime, timestamp } from "./formatter.js";

const START_UP_TIME = performance.now();

export interface SystemInfo {
  process: {
    pid: number;
    ppid: number;
    node: string;
    version: string;
    environment: string;
    uptime: string;
  };

  performance: {
    startupTime: string;
    systemUptime: string;
    timestamp: string;
  };

  memory: {
    total: string;
    free: string;
    used: string;
    usagePercent: number;
    process: {
      rss: string;
      heapTotal: string;
      heapUsed: string;
      external: string;
      arrayBuffers: string;
    };
  };

  cpu: {
    architecture: string;
    platform: string;
    model: string;
    cores: number;
    loadAverage: {
      oneMinute: number;
      fiveMinutes: number;
      fifteenMinutes: number;
    };
  };

  network: NodeJS.Dict<os.NetworkInterfaceInfo[]>;

  user: {
    username: string;
    uid: number;
    gid: number;
    shell: unknown;
    homedir: string;
  };
}

/**
 * Get information about the current system and Node.js process.
 */
export function getSystemInfo(): SystemInfo {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  const memoryUsagePercent =
    totalMemory > 0
      ? Number(((usedMemory / totalMemory) * 100).toFixed(2))
      : 0;

  const cpus = os.cpus();
  const load = os.loadavg();
  const processMemory = process.memoryUsage();

  return {
    process: {
      pid: process.pid,
      ppid: process.ppid,
      node: process.version,
      version: process.versions.node,
      environment: process.env.NODE_ENV ?? "unknown",
      uptime: formatTime(process.uptime() * 1000),
    },

    performance: {
      startupTime: formatTime(performance.now() - START_UP_TIME),
      systemUptime: formatTime(os.uptime() * 1000),
      timestamp: timestamp(new Date()),
    },

    memory: {
      total: formatBytes(totalMemory),
      free: formatBytes(freeMemory),
      used: formatBytes(usedMemory),
      usagePercent: memoryUsagePercent,

      process: {
        rss: formatBytes(processMemory.rss),
        heapTotal: formatBytes(processMemory.heapTotal),
        heapUsed: formatBytes(processMemory.heapUsed),
        external: formatBytes(processMemory.external),
        arrayBuffers: formatBytes(processMemory.arrayBuffers),
      },
    },

    cpu: {
      architecture: os.arch(),
      platform: os.platform(),
      model: cpus[0]?.model ?? "unknown",
      cores: cpus.length,

      loadAverage: {
        oneMinute: Number(load[0]?.toFixed(2) ?? 0),
        fiveMinutes: Number(load[1]?.toFixed(2) ?? 0),
        fifteenMinutes: Number(load[2]?.toFixed(2) ?? 0),
      },
    },

    network: os.networkInterfaces(),

    user: {
      username: os.userInfo().username,
      uid: os.userInfo().uid,
      gid: os.userInfo().gid,
      shell: os.userInfo().shell,
      homedir: os.userInfo().homedir,
    },
  };
}