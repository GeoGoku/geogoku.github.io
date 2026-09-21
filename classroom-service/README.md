# 课堂答题

老师端：https://geogoku.github.io/classroom/teacher.html

固定学生入口：https://geogoku.github.io/classroom/

本目录是 Cloudflare Workers 服务源代码，D1 绑定为 DB；静态页面在 ../classroom/。

安装依赖后使用 Wrangler 登录本人 Cloudflare 账户。首次创建 D1 并执行 schema.sql，将数据库 ID 配入 wrangler.jsonc；使用 wrangler secret put TEACHER_SECRET 设置高强度随机老师口令，再部署。更新 API 地址时同时修改 ../classroom/config.js。

老师口令必须通过 Cloudflare Secret 配置，禁止放入网页、公开代码或提交记录。请使用随机口令；老师登录令牌有效期为 12 小时。学生只能读取自己的答案。每次上课创建课堂，讲次切换保留同堂记录。

数据保存在 D1，不在此公开仓库内。网页不会保存全班名单或成绩。
