import TelegramBot from 'node-telegram-bot-api';
import { spawn } from 'child_process';
import logger from './logger.js';

const TOKEN = process.env.TOKEN;
const USER_ID = process.env.USER_ID;

if (!TOKEN || !USER_ID) {
  logger.error('Missing required environment variables', null, {
    missing: !TOKEN ? 'TOKEN' : 'USER_ID',
  });
  process.exit(1);
}

logger.info('Initializing Telegram bot', {
  userId: USER_ID,
  tokenPrefix: TOKEN.substring(0, 10) + '...',
});

const bot = new TelegramBot(TOKEN, {
  polling: {
    autoStart: true,
    params: {
      timeout: 30,
    },
  },
});

// Track consecutive errors for backoff
let consecutiveErrors = 0;
const MAX_BACKOFF_MS = 60000;

// Handle polling errors with restart logic
bot.on('polling_error', async (error) => {
  consecutiveErrors++;
  const backoffMs = Math.min(1000 * Math.pow(2, consecutiveErrors - 1), MAX_BACKOFF_MS);

  logger.telegram.error('polling_error', error, {
    errorCode: error.code,
    errorMessage: error.message,
    consecutiveErrors,
    backoffMs,
  });

  // Restart polling after backoff
  if (error.code === 'ETELEGRAM' || error.code === 'EFATAL') {
    logger.warn('Critical polling error, restarting polling...', { backoffMs });

    try {
      await bot.stopPolling();
    } catch (stopErr) {
      logger.warn('Error stopping polling', { error: stopErr.message });
    }

    setTimeout(async () => {
      try {
        await bot.startPolling();
        logger.info('Polling restarted successfully');
      } catch (startErr) {
        logger.error('Failed to restart polling, exiting...', startErr);
        process.exit(1); // Let Docker restart us
      }
    }, backoffMs);
  }
});

// Reset error counter on successful message
bot.on('message', () => {
  if (consecutiveErrors > 0) {
    logger.debug('Resetting error counter after successful message');
    consecutiveErrors = 0;
  }
});

// Handle webhook errors
bot.on('webhook_error', (error) => {
  logger.telegram.error('webhook_error', error);
});

bot.on('error', (error) => {
  logger.telegram.error('bot_error', error);
});

logger.info('Telegram bot started successfully', {
  polling: true,
});

// Lock to prevent multiple simultaneous sync operations
let isSyncing = false;

// Handle incoming messages
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username || 'unknown';
  const messageText = msg.text || '(no text)';
  
  logger.info('Received message', {
    userId,
    username,
    chatId,
    messageId: msg.message_id,
    messageText: messageText.substring(0, 100),
    expectedUserId: USER_ID,
  });
  
  // Check if user is authorized
  if (userId !== USER_ID) {
    logger.warn('Unauthorized access attempt', {
      userId,
      username,
      chatId,
      expectedUserId: USER_ID,
    });
    
    logger.telegram.request('sendMessage', { chat_id: chatId, text: '🫖 I\'m a teapot' });
    bot.sendMessage(chatId, '🫖 I\'m a teapot')
      .then(() => {
        logger.debug('Teapot message sent to unauthorized user', { userId, chatId });
      })
      .catch((error) => {
        logger.telegram.error('sendMessage', error, { userId, chatId, type: 'teapot' });
      });
    return;
  }
  
  logger.info('Authorized user message received', {
    userId,
    username,
    chatId,
    messageText: messageText.substring(0, 100),
  });
  
  // Show inline keyboard with GO button
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'GO', callback_data: 'go_button' }
        ]
      ]
    }
  };
  
  logger.telegram.request('sendMessage', { chat_id: chatId, text: 'Click the button to start:' });
  bot.sendMessage(chatId, 'Click the button to start:', options)
    .then((response) => {
      logger.telegram.response('sendMessage', response);
      logger.info('GO button sent successfully', {
        userId,
        chatId,
        messageId: response.message_id,
      });
    })
    .catch((error) => {
      logger.telegram.error('sendMessage', error, { userId, chatId, type: 'go_button' });
    });
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const username = query.from.username || 'unknown';
  const messageId = query.message.message_id;
  const callbackData = query.data;
  
  logger.info('Callback query received', {
    userId,
    username,
    chatId,
    messageId,
    callbackData,
    queryId: query.id,
  });
  
  // Check if user is authorized
  if (userId !== USER_ID) {
    logger.warn('Unauthorized callback query', {
      userId,
      username,
      chatId,
      callbackData,
      expectedUserId: USER_ID,
    });
    
    logger.telegram.request('answerCallbackQuery', { 
      callback_query_id: query.id, 
      text: '🫖 I\'m a teapot',
      show_alert: true,
    });
    bot.answerCallbackQuery(query.id, {
      text: '🫖 I\'m a teapot',
      show_alert: true
    }).catch((error) => {
      logger.telegram.error('answerCallbackQuery', error, { queryId: query.id, type: 'unauthorized' });
    });
    return;
  }
  
  // Check if sync is already running
  if (isSyncing) {
    logger.warn('Sync already in progress, rejecting callback', {
      userId,
      chatId,
      callbackData,
    });
    
    logger.telegram.request('answerCallbackQuery', { 
      callback_query_id: query.id, 
      text: '⏳ Sync already in progress. Please wait...',
      show_alert: true,
    });
    await bot.answerCallbackQuery(query.id, {
      text: '⏳ Sync already in progress. Please wait...',
      show_alert: true
    }).catch((error) => {
      logger.telegram.error('answerCallbackQuery', error, { queryId: query.id, type: 'busy' });
    });
    return;
  }
  
  // Set sync lock
  isSyncing = true;
  logger.sync.start({
    userId,
    username,
    chatId,
    messageId,
    callbackData,
  });
  
  // Answer the callback query
  logger.telegram.request('answerCallbackQuery', { 
    callback_query_id: query.id, 
    text: 'Processing...',
    show_alert: false,
  });
  await bot.answerCallbackQuery(query.id, {
    text: 'Processing...',
    show_alert: false
  }).catch((error) => {
    logger.telegram.error('answerCallbackQuery', error, { queryId: query.id, type: 'processing' });
  });
  
  // Update message to show processing
  logger.telegram.request('editMessageText', { 
    chat_id: chatId, 
    message_id: messageId, 
    text: 'Processing...',
  });
  await bot.editMessageText('Processing...', {
    chat_id: chatId,
    message_id: messageId
  }).catch((error) => {
    logger.telegram.error('editMessageText', error, { chatId, messageId, type: 'processing' });
  });
  
  // Execute the sync script via bun
  const scriptPath = './scripts/sync-transactions.js';
  logger.info('Spawning sync script process', {
    scriptPath,
    cwd: '/app',
    command: 'bun run',
    hasEnvVars: !!process.env.ICS_EMAIL && !!process.env.LUNCHMONEY_TOKEN,
  });
  
  const bunProcess = spawn('bun', ['run', scriptPath], {
    cwd: '/app',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env  // Pass all environment variables
  });
  
  logger.info('Sync script process spawned', {
    pid: bunProcess.pid,
    scriptPath,
  });
  
  let stdout = '';
  let stderr = '';
  let lastStatusMessage = 'Processing...';
  let statusUpdateInterval = null;
  let lastLogTime = Date.now();
  
  // Function to update status message
  const updateStatus = async (message) => {
    try {
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId
      });
      lastStatusMessage = message;
    } catch (error) {
      // If edit fails, just log it - we'll send final message later
      console.error('Failed to update status:', error);
    }
  };
  
  // Parse progress updates from stderr (JSON logs)
  bunProcess.stderr.on('data', async (data) => {
    const dataStr = data.toString();
    stderr += dataStr;
    const now = Date.now();

    // Log all stderr to console for Docker logs (but throttle if too verbose)
    if (now - lastLogTime > 1000 || dataStr.includes('step')) {
      logger.debug('Sync script stderr', {
        data: dataStr.trim().substring(0, 500),
        stderrLength: stderr.length,
      });
      lastLogTime = now;
    }

    // Try to parse JSON lines from stderr
    const lines = dataStr.split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const logEntry = JSON.parse(line);
        
        // Log structured sync step
        if (logEntry.step) {
          logger.sync.step(logEntry.step, logEntry.message || '', {
            ...logEntry,
            userId,
            chatId,
          });
        }
        
        if (logEntry.step && logEntry.message) {
          // Map step to user-friendly message
          let userMessage = '';
          switch (logEntry.step) {
            case 'browser_launch':
              userMessage = '🌐 Launching browser...';
              break;
            case 'page_load':
              userMessage = '📄 Loading login page...';
              break;
            case 'fill_form':
              userMessage = '✍️ Filling credentials...';
              break;
            case 'submit_form':
              userMessage = '🔐 Submitting login form...';
              break;
            case '2fa_wait':
              userMessage = '⏳ Waiting for 2FA confirmation on your phone...\n\nPlease check your mobile app and approve the login.';
              break;
            case '2fa_verified':
              userMessage = '✅ 2FA confirmed!';
              break;
            case 'determine_account':
              userMessage = '🔍 Determining account...';
              break;
            case 'account_selected':
            case 'account_auto_detected':
              userMessage = `✅ ${logEntry.message}`;
              break;
            case 'fetch_account_details':
              userMessage = `🔎 ${logEntry.message}`;
              break;
            case 'fetch_transactions':
              userMessage = '💳 Fetching transactions...';
              break;
            case 'fetch_chunk':
              userMessage = `📅 ${logEntry.message}`;
              break;
            case 'chunk_complete':
              userMessage = `✅ ${logEntry.message}`;
              break;
            case 'sync_lunchmoney':
              userMessage = `📤 Syncing to Lunch Money...\n${logEntry.message}`;
              break;
            case 'sync_batch':
              userMessage = `📦 ${logEntry.message}`;
              break;
            default:
              userMessage = logEntry.message || 'Processing...';
          }
          
          if (userMessage) {
            await updateStatus(userMessage);
          }
        }
        
        // Log errors from sync script
        if (logEntry.success === false || logEntry.error) {
          logger.sync.error(logEntry.step || 'unknown', new Error(logEntry.error || 'Unknown error'), {
            ...logEntry,
            userId,
            chatId,
          });
        }
      } catch (e) {
        // Not JSON, log as plain text if it looks important
        const trimmed = line.trim();
        if (trimmed.length > 0 && !trimmed.includes('[Object') && !trimmed.includes('[Function')) {
          logger.debug('Sync script non-JSON output', {
            line: trimmed.substring(0, 200),
          });
        }
      }
    }
  });
  
  // Collect stdout (final result)
  bunProcess.stdout.on('data', (data) => {
    const dataStr = data.toString();
    stdout += dataStr;
    logger.debug('Sync script stdout', {
      data: dataStr.trim().substring(0, 500),
      stdoutLength: stdout.length,
    });
  });
  
  bunProcess.on('close', async (code) => {
    logger.info('Sync script process closed', {
      pid: bunProcess.pid,
      exitCode: code,
      stdoutLength: stdout.length,
      stderrLength: stderr.length,
      userId,
      chatId,
    });
    
    // Release sync lock
    isSyncing = false;
    
    // Clear any status update interval
    if (statusUpdateInterval) {
      clearInterval(statusUpdateInterval);
      logger.debug('Cleared status update interval');
    }
    
    let result;
    
    if (code === 0) {
      logger.info('Sync script completed successfully', {
        exitCode: code,
        stdoutLength: stdout.length,
      });
      
      // Parse JSON result from stdout
      try {
        const resultJson = JSON.parse(stdout.trim());
        logger.sync.complete(resultJson, {
          userId,
          chatId,
          messageId,
        });
        
        if (resultJson.success) {
          result = `✅ ${resultJson.message}\n\n` +
            `📊 Transactions found: ${resultJson.transactionsCount}\n` +
            `📤 Synced to Lunch Money: ${resultJson.syncedCount}\n` +
            `📅 Period: ${resultJson.fromDate} to ${resultJson.untilDate}`;
        } else {
          result = `❌ Error: ${resultJson.error || 'Unknown error'}`;
          logger.sync.error(resultJson.step || 'unknown', new Error(resultJson.error), {
            ...resultJson,
            userId,
            chatId,
          });
        }
      } catch (e) {
        logger.warn('Failed to parse sync result JSON', {
          error: e.message,
          stdout: stdout.substring(0, 500),
          userId,
          chatId,
        });
        // Fallback if JSON parsing fails
        result = `✅ Success!\n\n${stdout || 'Sync completed successfully.'}`;
      }
    } else {
      logger.error('Sync script failed', null, {
        exitCode: code,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
        stderrPreview: stderr.substring(0, 500),
        userId,
        chatId,
      });
      
      // Try to parse error from stderr
      try {
        const stderrLines = stderr.trim().split('\n').filter(l => l.trim());
        const lastLine = stderrLines[stderrLines.length - 1] || '{}';
        const errorJson = JSON.parse(lastLine);
        
        if (errorJson.error) {
          result = `❌ Error: ${errorJson.error}\n\nStep: ${errorJson.step || 'unknown'}`;
          logger.sync.error(errorJson.step || 'unknown', new Error(errorJson.error), {
            ...errorJson,
            userId,
            chatId,
          });
        } else {
          result = `❌ Error (exit code: ${code})\n\n${stderr.substring(0, 500) || 'Script execution failed.'}`;
        }
      } catch (e) {
        logger.warn('Failed to parse error JSON from stderr', {
          error: e.message,
          stderrPreview: stderr.substring(0, 500),
          userId,
          chatId,
        });
        result = `❌ Error (exit code: ${code})\n\n${stderr.substring(0, 500) || 'Script execution failed.'}`;
      }
    }
    
    // Update message with final result
    logger.telegram.request('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: result.substring(0, 100) + '...',
    });
    
    try {
      await bot.editMessageText(result, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'GO', callback_data: 'go_button' }
            ]
          ]
        }
      });
      logger.info('Final result message updated', {
        userId,
        chatId,
        messageId,
        resultLength: result.length,
      });
    } catch (error) {
      // If message edit fails (e.g., message too old), send a new message
      logger.telegram.error('editMessageText', error, {
        chatId,
        messageId,
        type: 'final_result',
        fallback: true,
      });
      
      logger.telegram.request('sendMessage', {
        chat_id: chatId,
        text: result.substring(0, 100) + '...',
      });
      
      bot.sendMessage(chatId, result, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'GO', callback_data: 'go_button' }
            ]
          ]
        }
      }).then((response) => {
        logger.telegram.response('sendMessage', response);
        logger.info('Sent new message with result (edit failed)', {
          userId,
          chatId,
          newMessageId: response.message_id,
        });
      }).catch((sendError) => {
        logger.telegram.error('sendMessage', sendError, {
          chatId,
          type: 'final_result_fallback',
        });
      });
    }
  });
  
  bunProcess.on('error', async (error) => {
    // Release sync lock on error
    isSyncing = false;
    
    logger.error('Failed to spawn/execute sync script', error, {
      scriptPath,
      userId,
      chatId,
      messageId,
    });
    
    const errorMsg = `❌ Failed to execute script:\n${error.message}`;
    
    logger.telegram.request('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: errorMsg.substring(0, 100) + '...',
    });
    
    try {
      await bot.editMessageText(errorMsg, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'GO', callback_data: 'go_button' }
            ]
          ]
        }
      });
    } catch (editError) {
      logger.telegram.error('editMessageText', editError, {
        chatId,
        messageId,
        type: 'process_error',
        fallback: true,
      });
      
      logger.telegram.request('sendMessage', {
        chat_id: chatId,
        text: errorMsg.substring(0, 100) + '...',
      });
      
      bot.sendMessage(chatId, errorMsg, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'GO', callback_data: 'go_button' }
            ]
          ]
        }
      }).catch((sendError) => {
        logger.telegram.error('sendMessage', sendError, {
          chatId,
          type: 'process_error_fallback',
        });
      });
    }
  });
});
