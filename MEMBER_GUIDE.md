# 如何添加课题组成员

Member 页面中的所有照片都会由网站自动显示为统一的 180 × 220 像素，因此新成员的照片会和陈涛老师的照片保持一致。原始照片建议使用竖版半身照，人物居中，清晰度不低于 600 × 750 像素；网页会自动裁切，不需要事先改成精确尺寸。

## 第一步：上传照片

把照片上传到网站仓库。建议放在 `images/members/` 目录，并使用简短的英文文件名，例如：

```
images/members/feng-linxuan.jpg
```

文件名不要使用空格，建议使用 JPG 或 WebP 格式。

## 第二步：复制成员卡片

打开 `member.html`，在 `<div class="member-grid">` 内复制下面的内容。将姓名、身份、简介、邮箱和照片路径换成新成员的信息：

```html
<article class="member-card">
  <img src="images/members/student-name.jpg" alt="学生姓名">
  <h3>中文姓名 · English Name</h3>
  <p class="member-role">硕士研究生 · 2026级</p>
  <p>研究方向或简短介绍，建议控制在一至两句话。</p>
  <p><a href="mailto:student@cup.edu.cn">student@cup.edu.cn</a></p>
</article>
```

一般学生只需要提供以下四项：

1. 一张竖版照片；
2. 中英文姓名；
3. 身份、年级和一至两句话简介；
4. 常用邮箱。

如果不需要英文姓名或年级，可以直接删掉对应文字。新增成员时，可以用真实成员卡片替换页面上的 “Position open” 卡片。
