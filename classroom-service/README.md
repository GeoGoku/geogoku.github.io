# 课堂答题

老师端：https://geogoku.github.io/classroom/teacher.html

固定学生入口：https://geogoku.github.io/classroom/

本目录是 Cloudflare Workers 服务源代码，D1 绑定为 DB；静态页面在 ../classroom/。

## 部署（生产联调必须走远程 D1）

```bash
cd classroom-service
npm install
npx wrangler login
npx wrangler d1 execute geogoku-classroom --remote --file=schema.sql
npx wrangler d1 execute geogoku-classroom --remote --file=migrate-triggers.sql
npx wrangler secret put TEACHER_SECRET
npx wrangler deploy
```

本地调试也要连同一份远程库，否则老师电脑和手机扫码看到的不是同一份数据：

```bash
npx wrangler dev --remote
```

不要用默认的本地 D1。页面默认请求已部署的 `*.workers.dev`；只有当前端也跑在 localhost 时，才把 `classroom/config.js` 临时改成本机 Worker 地址。

老师口令必须通过 Cloudflare Secret 配置，禁止放入网页或仓库。登录令牌 12 小时有效。学生只能读取自己的答案。
