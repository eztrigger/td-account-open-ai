# TD Direct Investing — AI Account Opening Assistant
### Mac Mini 安全版

---

## 安全措施

别人只能访问开户聊天界面，**无法**触及你的 Mac 的任何其他内容：

| 层级 | 保护 |
|------|------|
| **ngrok** | 只暴露 3000 端口，不暴露 SSH/文件系统/其他服务 |
| **ngrok 密码** | 启动时可选密码保护，没密码打不开页面 |
| **Node.js 路由** | 只允许 `/` 和 `/api/chat` 两个路径，其他全部 404 |
| **请求限速** | 每个 IP 每分钟最多 30 次请求，防刷 |
| **Body 限制** | 单次请求最大 50KB，防大 payload 攻击 |
| **输入截断** | 每条消息最长 5000 字符，system prompt 最长 20000 |
| **超时** | 单次请求 60 秒超时，不会卡死 |
| **CSP 头** | 浏览器端限制只能加载允许的资源 |
| **无文件访问** | 不提供目录列表，屏蔽 .env/.git 等隐藏文件 |

**简单说：** 就像你开了一个只卖咖啡的窗口，别人只能买咖啡，进不了你家门。

---

## 首次准备

```bash
# 安装三个工具
brew install ollama ngrok node

# 注册 ngrok（免费）拿 token
# 去 https://ngrok.com → Sign up → Dashboard → Your Authtoken
ngrok config add-authtoken 你的token
```

## 每次使用

```bash
cd td-onboarding-mac
./start.sh
```

启动后会问你选择安全级别：

```
  🔒 Security options for public URL:

  1) Open access (anyone with link can use)
  2) Password protected (recommended)    ← 推荐
  3) Local only (no public URL)
```

选 2 后会生成随机密码：

```
  🚀 READY!
  Public:   https://a1b2-xxx.ngrok-free.app
  User: demo / Pass: 8f3a2b1c

  📋 把链接和密码发给试用的人
```

## 关闭

`Ctrl+C` → 一切自动停止，链接失效。
