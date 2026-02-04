// Logger Tests
// Tests for structured logging, log levels, formatting, and child loggers

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Logger', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Log Levels', () => {
    it('should respect DEBUG log level', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('Test');

      logger.debug('debug message');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('debug message'));
    });

    it('should respect INFO log level (default)', async () => {
      delete process.env.LOG_LEVEL;
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('Test');

      logger.info('info message');
      logger.debug('debug message'); // Should be suppressed

      // info should be logged
      expect(console.log).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('info message'));
    });

    it('should respect WARN log level', async () => {
      process.env.LOG_LEVEL = 'WARN';
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('Test');

      logger.info('info message'); // Suppressed
      logger.warn('warn message');

      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('warn message'));
    });

    it('should respect ERROR log level', async () => {
      process.env.LOG_LEVEL = 'ERROR';
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('Test');

      logger.info('info message'); // Suppressed
      logger.warn('warn message'); // Suppressed
      logger.error('error message');

      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('error message'));
    });

    it('should default to INFO for unknown log level', async () => {
      process.env.LOG_LEVEL = 'INVALID';
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('Test');

      logger.debug('debug message'); // Suppressed at INFO default
      logger.info('info message');

      expect(console.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('Log Output', () => {
    it('should log to console.error for ERROR level', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('Test');

      logger.error('error message', { code: 500 });

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('error message'));
    });

    it('should log to console.warn for WARN level', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('Test');

      logger.warn('warn message');

      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('should log to console.log for INFO and DEBUG', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('Test');

      logger.debug('debug msg');
      logger.info('info msg');

      expect(console.log).toHaveBeenCalledTimes(2);
    });

    it('should include module name in output', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('MyModule');

      logger.info('test');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('MyModule'));
    });

    it('should include data as JSON when provided', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      process.env.NODE_ENV = 'development';
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('Test');

      logger.info('with data', { key: 'value', count: 42 });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"key":"value"'));
    });

    it('should not include data section when no data provided', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      process.env.NODE_ENV = 'development';
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('Test');

      logger.info('no data');

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(output).toContain('no data');
    });
  });

  describe('Production Format', () => {
    it('should output JSON in production', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      process.env.NODE_ENV = 'production';
      const { createLogger } = await import('../lib/logger');
      const logger = createLogger('ProdModule');

      logger.info('prod message', { requestId: '123' });

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.module).toBe('ProdModule');
      expect(parsed.message).toBe('prod message');
      expect(parsed.level).toBe('INFO');
      expect(parsed.data.requestId).toBe('123');
      expect(parsed.timestamp).toBeDefined();
    });
  });

  describe('Child Logger', () => {
    it('should create child logger with combined module name', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const { createLogger } = await import('../lib/logger');
      const parent = createLogger('Parent');
      const child = parent.child('Child');

      child.info('from child');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Parent:Child'));
    });
  });

  describe('Pre-created Loggers', () => {
    it('should export pre-created loggers', async () => {
      const { apiLogger, wsLogger, tradeLogger, riskLogger } = await import('../lib/logger');

      expect(apiLogger).toBeDefined();
      expect(wsLogger).toBeDefined();
      expect(tradeLogger).toBeDefined();
      expect(riskLogger).toBeDefined();
    });
  });

  describe('LogLevel enum', () => {
    it('should export LogLevel enum values', async () => {
      const { LogLevel } = await import('../lib/logger');

      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
    });
  });
});
