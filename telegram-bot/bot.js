import TelegramBot from 'node-telegram-bot-api';
import { spawn } from 'child_process';

const TOKEN = process.env.TOKEN;
const USER_ID = process.env.USER_ID;

if (!TOKEN || !USER_ID) {
  console.error('Error: TOKEN and USER_ID must be set in environment variables');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// Handle polling errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
  console.error('Error code:', error.code);
  if (error.response && error.response.body) {
    console.error('Response body:', JSON.stringify(error.response.body, null, 2));
  }
});

// Handle webhook errors
bot.on('webhook_error', (error) => {
  console.error('Webhook error:', error);
});

console.log('Telegram bot started!');

// Lock to prevent multiple simultaneous sync operations
let isSyncing = false;

// Handle incoming messages
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  console.log(`Received message from user ${userId}, expected ${USER_ID}`);
  
  // Check if user is authorized
  if (userId !== USER_ID) {
    console.log(`Unauthorized user ${userId}, sending teapot response`);
    bot.sendMessage(chatId, '🫖 I\'m a teapot')
      .catch((error) => {
        console.error('Failed to send teapot message:', error);
      });
    return;
  }
  
  console.log(`Authorized user ${userId}, sending GO button`);
  
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
  
  bot.sendMessage(chatId, 'Click the button to start:', options)
    .then(() => {
      console.log('GO button sent successfully');
    })
    .catch((error) => {
      console.error('Failed to send message:', error);
    });
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const messageId = query.message.message_id;
  
  // Check if user is authorized
  if (userId !== USER_ID) {
    bot.answerCallbackQuery(query.id, {
      text: '🫖 I\'m a teapot',
      show_alert: true
    });
    return;
  }
  
  // Check if sync is already running
  if (isSyncing) {
    await bot.answerCallbackQuery(query.id, {
      text: '⏳ Sync already in progress. Please wait...',
      show_alert: true
    });
    return;
  }
  
  // Set sync lock
  isSyncing = true;
  
  // Answer the callback query
  await bot.answerCallbackQuery(query.id, {
    text: 'Processing...',
    show_alert: false
  });
  
  // Update message to show processing
  await bot.editMessageText('Processing...', {
    chat_id: chatId,
    message_id: messageId
  });
  
  // Execute the sync script via bun
  const scriptPath = './scripts/sync-transactions.js';
  const bunProcess = spawn('bun', ['run', scriptPath], {
    cwd: '/app',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env  // Pass all environment variables
  });
  
  let stdout = '';
  let stderr = '';
  let lastStatusMessage = 'Processing...';
  let statusUpdateInterval = null;
  
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
    stderr += data.toString();

    // Log all stderr to console for Docker logs
    console.error('[SYNC]', data.toString().trim());

    // Try to parse JSON lines from stderr
    const lines = data.toString().split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const logEntry = JSON.parse(line);
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
      } catch (e) {
        // Not JSON, ignore
      }
    }
  });
  
  // Collect stdout (final result)
  bunProcess.stdout.on('data', (data) => {
    stdout += data.toString();
    // Log stdout too for debugging
    console.log('[SYNC OUT]', data.toString().trim());
  });
  
  bunProcess.on('close', async (code) => {
    // Release sync lock
    isSyncing = false;
    
    // Clear any status update interval
    if (statusUpdateInterval) {
      clearInterval(statusUpdateInterval);
    }
    
    let result;
    
    if (code === 0) {
      // Parse JSON result from stdout
      try {
        const resultJson = JSON.parse(stdout.trim());
        if (resultJson.success) {
          result = `✅ ${resultJson.message}\n\n` +
            `📊 Transactions found: ${resultJson.transactionsCount}\n` +
            `📤 Synced to Lunch Money: ${resultJson.syncedCount}\n` +
            `📅 Period: ${resultJson.fromDate} to ${resultJson.untilDate}`;
        } else {
          result = `❌ Error: ${resultJson.error || 'Unknown error'}`;
        }
      } catch (e) {
        // Fallback if JSON parsing fails
        result = `✅ Success!\n\n${stdout || 'Sync completed successfully.'}`;
      }
    } else {
      // Try to parse error from stderr
      try {
        const errorJson = JSON.parse(stderr.trim().split('\n').pop() || '{}');
        if (errorJson.error) {
          result = `❌ Error: ${errorJson.error}\n\nStep: ${errorJson.step || 'unknown'}`;
        } else {
          result = `❌ Error (exit code: ${code})\n\n${stderr || 'Script execution failed.'}`;
        }
      } catch (e) {
        result = `❌ Error (exit code: ${code})\n\n${stderr || 'Script execution failed.'}`;
      }
    }
    
    // Update message with final result
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
    } catch (error) {
      // If message edit fails (e.g., message too old), send a new message
      console.error('Failed to edit message:', error);
      bot.sendMessage(chatId, result, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'GO', callback_data: 'go_button' }
            ]
          ]
        }
      });
    }
  });
  
  bunProcess.on('error', async (error) => {
    // Release sync lock on error
    isSyncing = false;
    
    console.error('Failed to execute script:', error);
    const errorMsg = `❌ Failed to execute script:\n${error.message}`;
    
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
      bot.sendMessage(chatId, errorMsg, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'GO', callback_data: 'go_button' }
            ]
          ]
        }
      });
    }
  });
});

// Handle errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

bot.on('error', (error) => {
  console.error('Bot error:', error);
});
