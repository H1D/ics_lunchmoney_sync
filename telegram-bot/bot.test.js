import { test, expect, mock } from "bun:test";
import { EventEmitter } from "events";

// bot.js wires itself up on import, so fake the Telegram client and the sync child process
const bots = [];
const children = [];
mock.module("node-telegram-bot-api", () => ({
  default: class {
    constructor() {
      this.handlers = {};
      bots.push(this);
    }
    on(event, fn) {
      (this.handlers[event] ??= []).push(fn);
    }
    async sendMessage() {
      return { message_id: 2 };
    }
    async editMessageText() {
      return {};
    }
    async answerCallbackQuery() {
      return true;
    }
  },
}));
mock.module("child_process", () => ({
  spawn: () => {
    const child = new EventEmitter();
    child.stdin = { written: "", write(text) { this.written += text; } };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    children.push(child);
    return child;
  },
}));

process.env.TOKEN = "test-token";
process.env.USER_ID = "42";
await import("./bot.js");
const emit = (event, arg) => Promise.all(bots[0].handlers[event].map((fn) => fn(arg)));
const from = { id: 42 };
const chat = { id: 7 };

test("the SMS code sent while the business sync waits goes to the sync's stdin, once", async () => {
  await emit("callback_query", { id: "q", data: "go_business", from, message: { chat, message_id: 1 } });
  const child = children[0];

  // A number before ICS asks for the code is just a message
  await emit("message", { chat, from, message_id: 2, text: "111111" });
  expect(child.stdin.written).toBe("");

  child.stderr.emit("data", Buffer.from('{"step":"otp_wait","message":"ICS sent an SMS code"}\n'));
  await emit("message", { chat, from, message_id: 3, text: "240 977" });
  expect(child.stdin.written).toBe("240977\n");

  await emit("message", { chat, from, message_id: 4, text: "123456" });
  expect(child.stdin.written).toBe("240977\n");
});
