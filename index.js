const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const base64 = require("js-base64");
const path = require("path");
const fs = require("fs");
const configs = require("./bot.json");

const bot_token = configs.bot_token || "";
const bot_chatid = configs.bot_chatid || "";
const rpc_url = configs.rpc_url || "";
const token = configs.token || "";

(async () => {
  const bot = new TelegramBot(bot_token, {polling: true});
  
  bot.onText(/\/start/, function startText(msg) {
    const opts = {
      reply_to_message_id: msg.message_id,
      reply_markup: JSON.stringify({
        keyboard: [
          ['正在下载', '正在等待', '已完成/已停止'],
          ['暂停任务', '继续任务', '移除任务']
        ]
      })
    };
    bot.sendMessage(msg.chat.id, 'Aria2Bot启动成功！', opts);
  });
  
  bot.on("message", async msg => {
    if (msg.chat.id != bot_chatid) {
      bot.sendMessage(msg.chat.id, "你不是我的主人哦！");
    } else {
      if (msg.text == "正在下载") {
        let [mes, gid_li] = await aria2_tellActive();
        if (mes != "当前没有下载任务！") {
          mes = mes.join("\n");
          const opts = {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '自动刷新',
                    callback_data: 'edit'
                  }
                ]
              ]
            }
          };
          bot.sendMessage(msg.from.id, mes, opts);
          bot.on('callback_query', function onCallbackQuery(callbackQuery) {
            const action = callbackQuery.data;
            const msg = callbackQuery.message;
            const opts = {
              chat_id: msg.chat.id,
              message_id: msg.message_id,
            };
          
            let i = 1;
            while (i < 100) {
                i++;
                ((i) => {
                    setTimeout(async () => {
                      const [edit_mes, gids] = await aria2_tellActive();
                      bot.editMessageText(edit_mes.join("\n"), opts);
                    }, i*3000)
                })(i);
            }
            
          });
        } else {
          bot.sendMessage(msg.from.id, mes);
        }
      } else if (msg.text == "已完成/已停止") {
        const data = await aria2_tellStopped();
        bot.sendMessage(msg.chat.id, data);
      } else if (msg.text == "正在等待") {
        let [mes, gid_li] = await aria2_tellWaiting();
        if (mes == "当前没有下载任务！") {
          mes = ["当前没有正在等待的任务！"];
        }
        bot.sendMessage(msg.chat.id, mes.join("\n"));
      } else if (msg.text == "移除任务") {
        let [mes1, gid_li1] = await aria2_tellActive();
        
        let [mes2, gid_li2] = await aria2_tellWaiting();
        if (mes1 == "当前没有下载任务！") {
          mes1 = [];
        }
        if (mes2 == "当前没有下载任务！") {
          mes2 = [];
        }
        let [mes, gid_li] = [mes1.concat(mes2), gid_li1.concat(gid_li2)];
        if (mes.join("") == "") {
          return bot.sendMessage(msg.chat.id, "当前没有可移除任务！");
        }
        
        const opts = {
          reply_markup: {
            inline_keyboard: (() => {
             const line = [[]];
             for (let gid of gid_li) {
                 if (line[line.length - 1].length == 4) {
                   line.push([]);
                 }
                 line[line.length - 1].push({
                     text: gid_li.indexOf(gid) + 1,
                     callback_data: gid
                 });
         
             }
             return line;
            })()
          }
        };
        // bot.sendMessage(msg.from.id, `请点击按钮选择要删除的任务：\n${mes}`, opts)
        bot.sendMessage(msg.from.id, (() => {
          const mss = [];
          for (ms of mes) {
            mss.push(`任务序号：${mes.indexOf(ms) + 1}\n${ms}`);
          }
          
          return mss.join("\n");
        })(), opts)
        bot.on('callback_query', async function onCallbackQuery(callbackQuery) {
          const gid = callbackQuery.data;
          const msg = callbackQuery.message;
          const opts = {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
          };
          const data = await aria2_remove(gid);
          bot.editMessageText(`{${data.result}}已删除！`, opts);
          
        });
      } else if (msg.text == "暂停任务") {
        
        let [mes, gid_li] = await aria2_tellActive();
        if (mes == "当前没有下载任务！") {
          return bot.sendMessage(msg.chat.id, "当前没有可暂停任务！");
        }
        const opts = {
          reply_markup: {
            inline_keyboard: (() => {
             const line = [[]];
             for (let gid of gid_li) {
                 if (line[line.length - 1].length == 4) {
                   line.push([]);
                 }
                 line[line.length - 1].push({
                     text: gid_li.indexOf(gid) + 1,
                     callback_data: gid
                 });
         
             }
             return line;
            })()
          }
        };
        bot.sendMessage(msg.from.id, (() => {
          const mss = [];
          for (ms of mes) {
            mss.push(`请点击想要暂停的任务\n任务序号：${mes.indexOf(ms) + 1}\n${ms}`);
          }
          
          return mss.join("\n");
        })(), opts)
        bot.on('callback_query', async function onCallbackQuery(callbackQuery) {
          const gid = callbackQuery.data;
          const msg = callbackQuery.message;
          const opts = {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
          };
          const result = await aria2_pause();
          bot.editMessageText(`{${result}}已暂停！`, opts);
          
        });

      } else if (msg.text == "继续任务") {
        let [mes, gid_li] = await aria2_tellWaiting();
        if (mes == "当前没有下载任务！") {
          return bot.sendMessage(msg.chat.id, "当前没有可继续任务！")
        }
        const opts = {
          reply_markup: {
            inline_keyboard: (() => {
             const line = [[]];
             for (let gid of gid_li) {
                 if (line[line.length - 1].length == 4) {
                   line.push([]);
                 }
                 line[line.length - 1].push({
                     text: gid_li.indexOf(gid) + 1,
                     callback_data: gid
                 });
         
             }
             return line;
            })()
          }
        };
        bot.sendMessage(msg.from.id, (() => {
          const mss = [];
          for (ms of mes) {
            mss.push(`请点击想要继续的任务\n任务序号：${mes.indexOf(ms) + 1}\n${ms}`);
          }
          
          return mss.join("\n");
        })(), opts)
        bot.on('callback_query', async function onCallbackQuery(callbackQuery) {
          const gid = callbackQuery.data;
          const msg = callbackQuery.message;
          const opts = {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
          };
          const data = await aria2_unpause(gid);
          bot.editMessageText(`{${data.result}}已开始！`, opts);
          
        });
        

      } else if (/application\/x\-bittorrent/.test(JSON.stringify(msg))) {
        try {
          //console.log(msg);
          const stream = bot.getFileStream(msg.document.file_id);
          const Torrent = await streamToBuffer(stream);
          const data = await aria2_addTorrent(base64.encode(Torrent));
          bot.sendMessage(msg.chat.id, `{${data}}任务添加成功！`);
        } catch (error) {
          bot.sendMessage(msg.chat.id, `${error}\n出错了...`);
        }

      } else {
        const reg = /^(magnet:|http:\/\/|https:\/\/).*/;
        if (reg.test(msg.text)) {
          const gid = await aria2_addUri(msg.text);
          bot.sendMessage(msg.chat.id, `{${gid}}任务开始下载！`);
        } else {
          //console.log(msg);
          bot.sendMessage(msg.chat.id, `您发送的内容我不认识哦～`);
        }
        
      }
    }
    
  });
  
})();


//添加下载链接
function aria2_addUri(uris) {
  const uri_li = uris.split("\n")
  const request = {
    "jsonrpc" : "2.0",
    "method" : "aria2.addUri",
    "id" : "doyo",
    "params": [`token:${token}`, uri_li]
  };
  return axios.post(rpc_url, request).then(rsp => {
    //console.log(`{${rsp.data.result}}任务开始下载！`)
    return rsp.data.result;
  });
}

//添加种子
function aria2_addTorrent(torrent) {
  //
  const opt = {
    "jsonrpc" : "2.0",
    "method" : "aria2.addTorrent",
    "id" : "doyo",
    "params": [`token:${token}`, torrent]
  };
  return axios.post(rpc_url, opt).then(rsp => {
    return rsp.data.result;
  });
}

//暂停任务
function aria2_pause(gid) {
  const request = {
    "jsonrpc" : "2.0",
    "method" : "aria2.pause",
    "id" : "doyo",
    "params": [`token:${token}`, gid]
  };
  return axios.post(rpc_url, request).then(rsp => {
    //console.log(rsp.data)
    return rsp.data;
  });
}

//继续任务
function aria2_unpause(gid) {
  const request = {
    "jsonrpc" : "2.0",
    "method" : "aria2.unpause",
    "id" : "doyo",
    "params": [`token:${token}`, gid]
  };
  return axios.post(rpc_url, request).then(rsp => {
    //console.log(rsp.data)
    return rsp.data;
  });
}


//删除任务
function aria2_remove(gid) {
  const opt = {
    "jsonrpc" : "2.0",
    "method" : "aria2.remove",
    "id" : "doyo",
    "params": [`token:${token}`, gid]
  };
  return axios.post(rpc_url, opt).then(rsp => {
    return rsp.data.result;
  });
}

//获取正在等待列表
function aria2_tellWaiting() {
  const opt = {
    "jsonrpc" : "2.0",
    "method" : "aria2.tellWaiting",
    "id" : "doyo",
    "params": [`token:${token}`, 0, 10, [
      "gid",
      "totalLength",
      "completedLength",
      "uploadSpeed",
      "downloadSpeed",
      "connections",
      "numSeeders",
      "files",
      "seeder",
      "status",
      "errorCode",
      "verifiedLength",
      "verifyIntegrityPending"
    ]]
  };
  return axios.post(rpc_url, opt).then(rsp => {
    if (rsp.data.result.length == 0) {
      return ["当前没有下载任务！", []];
    }
    const mes = [];
    const gid_li = [];
    for (let result of rsp.data.result) {
      let name = path.basename(result.files[0].path);
      let completedLength = byteTransfer(result.completedLength);
      let totalLength = byteTransfer(result.totalLength);
      let gid = result.gid;
      let status = result.status;

      let str = `文件名: ${name}
状态: ${status}
已下载: ${completedLength} 共 ${totalLength}
GID: ${gid}
`;
      mes.push(str);
      gid_li.push(gid);
    }
    // return [mes.join(""), gid_li];
    return [mes, gid_li];
  });
}

//获取正在下载列表
function aria2_tellActive() {
  const request = {
    "jsonrpc" : "2.0",
    "method" : "aria2.tellActive",
    "id" : "doyo",
    "params": [`token:${token}`, [
      "gid",
      "totalLength",
      "completedLength",
      "uploadSpeed",
      "downloadSpeed",
      "connections",
      "numSeeders",
      "seeder",
      "status",
      "errorCode",
      "verifiedLength",
      "verifyIntegrityPending",
      "files",
      "bittorrent",
      "infoHash"
    ]]
  };
  return axios.post(rpc_url, request).then(rsp => {
    //console.log(rsp.data.result[0].files[0].path)
    //return rsp.data.result;
    
    if (rsp.data.result.length == 0) {
      return ["当前没有下载任务！", []];
    }
    let mes = [];
    let gid_li = [];
    for (let result of rsp.data.result) {
      let name = path.basename(result.files[0].path);
      let completedLength = byteTransfer(result.completedLength);
      let totalLength = byteTransfer(result.totalLength);
      let downloadSpeed = byteTransfer(result.downloadSpeed);
      let gid = result.gid;
      let str = `文件名: ${name}
${ProgressBar(result.completedLength, result.totalLength)}
已下载: ${completedLength}  共 ${totalLength} 
速度: ${downloadSpeed}/s
GID: ${result.gid}
`;
      mes.push(str);
      gid_li.push(gid);
    }
    //console.log(mes.join(""));
    // return [mes.join(""), gid_li];
    return [mes, gid_li];
    
  });
}

//获取停止下载列表
function aria2_tellStopped() {
  const opt = {
    "jsonrpc" : "2.0",
    "method" : "aria2.tellStopped",
    "id" : "doyo",
    "params": [`token:${token}`, -1, 10, [
      "gid",
      "totalLength",
      "completedLength",
      "uploadSpeed",
      "downloadSpeed",
      "connections",
      "numSeeders",
      "files",
      "seeder",
      "status",
      "errorCode",
      "verifiedLength",
      "verifyIntegrityPending"
    ]]
  };
  return axios.post(rpc_url, opt).then(rsp => {
    if (rsp.data.result.length == 0) {
      return "当前没有已完成/已停止任务！"
    }
    const mes = [];
    for (let result of rsp.data.result) {
      let name = path.basename(result.files[0].path);
      let completedLength = byteTransfer(result.completedLength);
      let totalLength = byteTransfer(result.totalLength);
      let gid = result.gid;
      let status = result.status;

      let str = `
文件名: ${name}
${ProgressBar(result.completedLength, result.totalLength)}
已下载: ${completedLength} 共 ${totalLength}
状态: ${status}
GID: ${gid}
`;
      mes.push(str);
    }
    return mes.join("");
  });
}

//字节转换
function byteTransfer(byte) {
    const k = 1024;
    const sizes = [' B', ' KB', ' MB', ' GB', ' TB'];
    let i = 0;
    let byteTransfered;
    if (byte == 0) {
        return "0 KB";
    }else{
        i = Math.floor(Math.log(byte) / Math.log(k));
    }
    byteTransfered = (byte / Math.pow(k,i)).toFixed(2) + sizes[i];
    return byteTransfered;
}

//stream To Buffer
function streamToBuffer(stream) { 
  return new Promise((resolve, reject) => {
    let buffers = [];
    stream.on('error', reject);
    stream.on('data', (data) => buffers.push(data));
    stream.on('end', () => resolve(Buffer.concat(buffers)))  
  });
 }
 
//进度条
function ProgressBar(num, total){
  const description = "下载进度";
  const length = 10;
   
  let percent = (num / total).toFixed(4);
  let cell_num = Math.floor(percent * length);
  let cell = '';
  for (let i=0;i<cell_num;i++) {
    cell += '▣';
  }
  let empty = '';
  for (let i=0;i<length-cell_num;i++) {
    empty += '▒';
  }
  let cmdText = description + ':\n' + cell + empty + " " + (100*percent).toFixed(2) + '%';
  
  return cmdText
 
}