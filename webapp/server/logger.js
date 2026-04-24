import util from "node:util";
import pino from "pino";

const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
});

function formatArgs(args) {
  return args
    .map((value) =>
      typeof value === "string"
        ? value
        : util.inspect(value, {
          depth: 5,
          breakLength: 120,
        }),
    )
    .join(" ");
}

export const consoleLogger = {
  log: (...args) => baseLogger.info(formatArgs(args)),
  warn: (...args) => baseLogger.warn(formatArgs(args)),
  error: (...args) => baseLogger.error(formatArgs(args)),
};
