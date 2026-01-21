/**
 * Structured logging utility
 * Provides consistent, structured logging with timestamps and context
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = process.env.LOG_LEVEL 
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
  : LOG_LEVELS.INFO;

function formatTimestamp() {
  return new Date().toISOString();
}

// Simple text format for better readability in Docker logs
function formatLog(level, message, context = {}) {
  const timestamp = formatTimestamp();
  const contextStr = Object.keys(context).length > 0 
    ? ' | ' + Object.entries(context)
        .filter(([k, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' ')
    : '';
  return `${timestamp} [${level}] ${message}${contextStr}`;
}

const logger = {
  debug: (message, context) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(formatLog('DEBUG', message, context));
    }
  },

  info: (message, context) => {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(formatLog('INFO', message, context));
    }
  },

  warn: (message, context) => {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(formatLog('WARN', message, context));
    }
  },

  error: (message, error, context = {}) => {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      const errorContext = {
        ...context,
        error: {
          message: error?.message || String(error),
          name: error?.name,
          code: error?.code,
          stack: error?.stack ? error.stack.split('\n').slice(0, 5).join('\n') : undefined,
        },
      };
      console.error(formatLog('ERROR', message, errorContext));
    }
  },

  // Helper for logging Telegram API calls
  telegram: {
    request: (method, params, context = {}) => {
      logger.debug(`Telegram API: ${method}`, {
        ...context,
        method,
        params: params ? Object.keys(params).reduce((acc, key) => {
          // Mask sensitive data
          if (key === 'text' && params[key]?.length > 100) {
            acc[key] = params[key].substring(0, 100) + '...';
          } else if (typeof params[key] === 'string' && params[key].length > 200) {
            acc[key] = params[key].substring(0, 200) + '...';
          } else {
            acc[key] = params[key];
          }
          return acc;
        }, {}) : {},
      });
    },
    response: (method, response, context = {}) => {
      logger.debug(`Telegram API response: ${method}`, {
        ...context,
        method,
        success: true,
        responseType: typeof response,
        hasData: !!response,
      });
    },
    error: (method, error, context = {}) => {
      logger.error(`Telegram API error: ${method}`, error, {
        ...context,
        method,
        code: error?.code,
        response: error?.response ? {
          statusCode: error.response.statusCode,
          statusMessage: error.response.statusMessage,
          body: typeof error.response.body === 'object' 
            ? JSON.stringify(error.response.body).substring(0, 500)
            : String(error.response.body).substring(0, 500),
        } : undefined,
      });
    },
  },

  // Helper for logging sync process
  sync: {
    start: (context = {}) => {
      logger.info('Sync process started', context);
    },
    step: (step, message, context = {}) => {
      logger.info(`Sync step: ${step}`, { step, message, ...context });
    },
    progress: (step, progress, total, context = {}) => {
      logger.info(`Sync progress: ${step}`, {
        step,
        progress,
        total,
        percentage: total > 0 ? Math.round((progress / total) * 100) : 0,
        ...context,
      });
    },
    complete: (result, context = {}) => {
      logger.info('Sync process completed', {
        success: result.success,
        transactionsCount: result.transactionsCount,
        syncedCount: result.syncedCount,
        ...context,
      });
    },
    error: (step, error, context = {}) => {
      logger.error(`Sync error at step: ${step}`, error, {
        step,
        ...context,
      });
    },
  },
};

export default logger;
