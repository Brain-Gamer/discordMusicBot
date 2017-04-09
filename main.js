const discord  = require('discord.js');
const commands = require('./commands.js');
const yaml = require("js-yaml");
const fs = require("fs");

const bot = new discord.Client();
let conf = {};

try {
  conf = yaml.safeLoad(fs.readFileSync("settings.yml", "utf8"));
} catch (e) {
  console.warn(e);
}

bot.on("ready", () => {
  console.log("Started!");
  if (conf.customGame.active) {
    bot.user.setGame(conf.customGame.title);
  } else {
    bot.user.setGame("");
  }
});

bot.on("message", msg => {

  if (msg.content.substr(0, 1) === conf.cmdPrefix) {
    var cmd  = /\$(\S+)/.exec(msg.content)[1];
    var args = msg.content.match(/(\S+)/g);
    args.shift();

    commands.run(cmd, bot, msg, args);
  }
});

bot.login(conf.botToken);
