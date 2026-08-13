# 汉字日语读音候选服务

一个轻量的单进程服务：Vite 构建 React 页面，原生 Node HTTP 服务同时提供静态页面和 `/api/convert`。

## 环境

- Node.js `>=20.19.0`

不依赖 Next.js、Vinext、Cloudflare 或数据库服务。

## 本地开发

```bash
npm install
npm run dev
```

访问 `http://localhost:4317`。

## 生产运行

```bash
npm run build
npm start
```

默认监听 `4317`；可通过 `PORT` 和 `HOST` 环境变量覆盖。

## 子路径反向代理

生产构建已固定使用 `/japanese-reading-service/` 作为资源与 API 的基础路径。Nginx 可使用：

```nginx
location = /japanese-reading-service {
    return 301 /japanese-reading-service/;
}

location ^~ /japanese-reading-service/ {
    proxy_pass http://127.0.0.1:4317/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

使用 PM2：

```bash
pm2 start npm --name japanese-reading-service -- start
pm2 save
```

更新代码后执行：

```bash
git pull
npm ci
npm run build
pm2 restart japanese-reading-service --update-env
```
