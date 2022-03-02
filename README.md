# Aria2_Bot
 
 ## 安装
 ### 1.克隆仓库
```bash
git clone https://github.com/doyoman/Aria2_Bot.git
```
### 2.安装模块
```bash
npm install node-telegram-bot-api js-base64 axios
```
### 3.编辑配置文件 bot.json
  修改 bot.json-example，并重命名为bot.json。

### 4.启动bot
#### 方法一：
```bash
node index.js
```

#### 方法二：
```bash
pm2 start index.js
```