# 汉字日语读音候选服务

一个轻量的单进程服务：Vite 构建 React 页面，原生 Node HTTP 服务同时提供静态页面和 `/api/convert`。

[项目开发笔记](https://738ngx.site/dev/software-design/articles/%E6%B1%89%E5%AD%97%E6%97%A5%E8%AF%AD%E8%AF%BB%E9%9F%B3%E5%80%99%E9%80%89%E5%B7%A5%E5%85%B7%E5%BC%80%E5%8F%91%E7%AC%94%E8%AE%B0)

服务不维护人工整词读音表、字形例外表或自训练排序权重。整词候选来自 JMnedict 快照；单字候选来自 KANJIDIC2 快照。界面将原表记词典记录、日文字形归一化检索线索、逐字直拼和连浊可能变体分层展示；后两者不与词典记录混排。归一化命中只是一条检索线索，不代表原表记与该词典实体相同。逐字层仅在前后项均为训读、后项为可浊化清音起首且内部没有莱曼定律所排除的浊阻碍音等保守条件下，生成明确标注的连浊可能候选；它不是整词词典证据。当前 JMnedict 快照仅保留地名表记和读音，未保留释义、地域或原始条目 ID，不能消歧同形实体。简繁转换由 OpenCC 提供，罗马字由 WanaKana 提供。

## 数据来源与许可

- [JMnedict / ENAMDICT 说明](https://www.edrdg.org/enamdict/enamdict_doc.html)：整词地名读音快照。
- [KANJIDIC2 项目](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project)：单字音读、训读和名乘读快照。
- [EDRDG 字典许可](https://www.edrdg.org/edrdg/licence.html)：JMnedict 与 KANJIDIC2 采用 CC BY-SA 4.0；派生数据应保留适当署名与相同许可条件。

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
