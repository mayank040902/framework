export * from "./logger.js";
export * from "./config.js";
export * from "./serialize.js";
export * from "./transport.js";
export * from "./http.js";

import type pino from "pino";

export type Logger = pino.Logger;
export type Level = pino.Level;
export type LevelWithSilent = pino.LevelWithSilent;
export type DestinationStream = pino.DestinationStream;