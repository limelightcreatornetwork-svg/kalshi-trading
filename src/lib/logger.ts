/**
 * Simple structured logging utility
 *
 * Provides consistent log formatting across the application with:
 * - Log levels (debug, info, warn, error)
 * - Structured JSON output in production
 * - Colored output in development
 * - Context/module tagging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[36m', // Cyan
  [LogLevel.INFO]: '\x1b[32m',  // Green
  [LogLevel.WARN]: '\x1b[33m',  // Yellow
  [LogLevel.ERROR]: '\x1b[31m', // Red
};

const RESET_COLOR = '\x1b[0m';

interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

function getMinLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  switch (envLevel) {
    case 'DEBUG': return LogLevel.DEBUG;
    case 'INFO': return LogLevel.INFO;
    case 'WARN': return LogLevel.WARN;
    case 'ERROR': return LogLevel.ERROR;
    default: return LogLevel.INFO;
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function formatLogEntry(entry: LogEntry): string {
  if (isProduction()) {
    // JSON format for production (easier to parse in log aggregators)
    return JSON.stringify(entry);
  }

  // Pretty format for development
  const color = LOG_LEVEL_COLORS[LogLevel[entry.level as keyof typeof LogLevel] as LogLevel] || '';
  const levelPadded = entry.level.padEnd(5);
  let output = `${color}[${entry.timestamp}] ${levelPadded}${RESET_COLOR} [${entry.module}] ${entry.message}`;

  if (entry.data && Object.keys(entry.data).length > 0) {
    output += ` ${JSON.stringify(entry.data)}`;
  }

  return output;
}

class Logger {
  private module: string;
  private minLevel: LogLevel;

  constructor(module: string) {
    this.module = module;
    this.minLevel = getMinLogLevel();
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (level < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LOG_LEVEL_NAMES[level],
      module: this.module,
      message,
      data,
    };

    const formatted = formatLogEntry(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, data);
  }

  /**
   * Create a child logger with a sub-module name
   */
  child(subModule: string): Logger {
    return new Logger(`${this.module}:${subModule}`);
  }
}

/**
 * Create a logger for a specific module
 *
 * @example
 * const log = createLogger('KalshiAPI');
 * log.info('Fetching balance');
 * log.error('API call failed', { statusCode: 500, error: 'Server error' });
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

// Pre-created loggers for common modules
export const apiLogger = createLogger('KalshiAPI');
export const wsLogger = createLogger('KalshiWS');
export const tradeLogger = createLogger('Trading');
export const riskLogger = createLogger('Risk');
