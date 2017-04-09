const EventEmitter = require('events');
const ytdl         = require('ytdl-core');
const youtube      = require('youtube-api');
const yaml = require("js-yaml");
const fs = require("fs");

class events extends EventEmitter {}
const botEvents = new events();

let music = {};
let conf = {};

try {
  conf = yaml.safeLoad(fs.readFileSync("settings.yml", "utf8"));
} catch (e) {
  console.warn(e);
}

function shuffle(a) {
    for (let i = a.length; i; i--) {
        let j = Math.floor(Math.random() * i);
        [a[i - 1], a[j]] = [a[j], a[i - 1]];
    }
}

botEvents.on("test", function(bot, msg, args) {
  console.log(args);
});

botEvents.on("ping", function(bot, msg, args) {
  msg.channel.sendMessage("pong").catch();
});

botEvents.on("clear", function(bot, msg, args) {
  msg.channel.fetchMessages().then(all => msg.channel.bulkDelete(all)).catch(
    msg.channel.fetchMessages().then(all => all.filter(message => {
      var maxTime = new Date().getTime() + 1209600000;
      if (message.createdTimestamp < maxTime) message.delete();
    })).catch(console.error()));
});

botEvents.on("join", function(bot, msg, args) {
  if (msg.member.voiceChannel) {
    msg.member.voiceChannel.join().catch();
    msg.delete().catch();
  } else {
    msg.channel.sendMessage("You are not in a voice channel").catch();
  }
});

botEvents.on("leave", function(bot, msg, args) {

  if (music[msg.guild.id].dispatcher) {
    music[msg.guild.id].queue = [];
    music[msg.guild.id].dispatcher.end();
  }

  msg.guild.member(bot.user).voiceChannel.leave();
  msg.delete()
    .catch();
});

botEvents.on("queue", function(bot, msg, args) {
  if (args.length === 1 || args.length === 2) {

    var id = args[0].match("v=([a-zA-Z0-9\_\-]+)&?");
    var list = args[0].match("list=([a-zA-Z0-9\-\_]+)&?");

    id   = id ? id[1] : false;
    list = list ? list[1] : false;

    if (list && (args[1] === "p" || args[1] === undefined)) {
      queuePlaylist(list, msg.guild.id);
    } else if (id && (args[1] === "v" || args[1] === undefined)) {

      youtube.videos.list({
        part : "snippet",
        id : id,
        key : conf.ytApiToken
      }, function(err, data) {
        if (!err) {
          music[msg.guild.id].queue.push({"title" : data.items[0].snippet.title, "id" : data.items[0].id});
        } else {
          console.error(err);
        }
      });

    } else {
      msg.channel.send("Invalid url");
    }

  } else {
    msg.channel.send("Usage: ```$queue [youtube-url] {p / v}```");
  }
});

botEvents.on("play", function(bot, msg, args) {
  if (music[msg.guild.id].playing === false) {
    if (msg.guild.member(bot.user).voiceChannel) {
      playQueue(bot, msg, msg.guild);
      msg.delete().catch();
    } else {
      msg.channel.send("Bot is not in a voice channel");
    }
  } else {
    msg.channel.send("Already playing");
  }
});

botEvents.on("pause", function(bot, msg, args) {
  if (music[msg.guild.id].playing === true && music[msg.guild.id].dispatcher) {
    music[msg.guild.id].dispatcher.pause();
    music[msg.guild.id].playing = false;
    msg.delete().catch();
  } else {
    msg.channel.send("Not playing");
  }
});

botEvents.on("resume", function(bot, msg, args) {
  if (music[msg.guild.id].playing === false && music[msg.guild.id].dispatcher) {
    music[msg.guild.id].dispatcher.resume();
    music[msg.guild.id].playing = true;
    msg.delete().catch();
  } else {
    msg.channel.send("Not paused");
  }
});

botEvents.on("skip", function(bot, msg, args) {
  if (music[msg.guild.id].dispatcher) {
    music[msg.guild.id].dispatcher.end();
    msg.delete().catch();
  }
});

botEvents.on("shuffle", function(bot, msg, args) {
  shuffle(music[msg.guild.id].queue);
  msg.delete().catch();
});

botEvents.on("volume", function(bot, msg, args) {
  if (args.length === 2) {
    switch (args[1]) {
      case "%":
        music[msg.guild.id].dispatcher.setVolume(args[0]/100);
        music[msg.guild.id].volume = music[msg.guild.id].dispatcher.volume;
        break;

      case "db":
        music[msg.guild.id].dispatcher.setVolumeDecibels(args[0]);
        music[msg.guild.id].volume = music[msg.guild.id].dispatcher.volume;
        break;

      default:
        msg.channel.sendMessage("Usage: $volume [amount] [% / db]");
        break;
    }
  } else {
    msg.channel.sendMessage("Usage: $volume [amount] [% / db]");
  }
  msg.delete().catch();
});

//botEvents.on("", function(bot, msg, args) {});

/*********************************************************************************/
/*********************************************************************************/

function queuePlaylist(id, guildId, pageToken = null) {
  youtube.playlistItems.list({
    part:"snippet",
    playlistId: id,
    maxResults: 50,
    pageToken: pageToken,
    key : conf.ytApiKey
  }, function(err, data) {
    if (!err) {
      for (var x in data.items) {
        music[guildId].queue.push({"title" : data.items[x].snippet.title, "id" : data.items[x].snippet.resourceId.videoId});
      }

      if (data.nextPageToken) {
        queuePlaylist(id, guildId, data.nextPageToken);
      }
    } else {
      console.error(err);
    }
  });
}

function playQueue(bot, msg, guild) {
  if (music[guild.id].queue.length > 0)  {
    music[guild.id].stream     = ytdl("https://www.youtube.com/watch?v="+music[guild.id].queue[0].id, {filter: "audioonly", quality: conf.audioQuality});
    music[guild.id].dispatcher = guild.member(bot.user).voiceChannel.connection.playStream(music[guild.id].stream);
    music[guild.id].dispatcher.setVolume(music[guild.id].volume);
    music[guild.id].playing = true;
    msg.channel.send("Currently playing: " + music[guild.id].queue[0].title).then(message => {music[guild.id].infoMsg = message;}).catch();
    if (!conf.customGame.active) bot.user.setGame(music[guild.id].queue[0].title);

    music[guild.id].stream.on("error", (err) => {
      console.error(err);
    });

    music[guild.id].dispatcher.once("end", (reason) => {
      music[guild.id].playing    = false;
      music[guild.id].dispatcher = null;
      music[guild.id].infoMsg.delete().catch();
      music[guild.id].queue.shift();
      playQueue(bot, msg, guild);
    });
  } else {
    if (!conf.customGame.active) bot.user.setGame("");
  }
}

/*********************************************************************************/
/*********************************************************************************/

module.exports = {
  run: function(command, bot, msg, args) {
    if (music[msg.guild.id] === undefined) music[msg.guild.id] = {playing: false, volume: 0.5, dispatcher: null, stream: null, infoMsg: null, queue: []};
    botEvents.emit(command, bot, msg, args);
  }
};
