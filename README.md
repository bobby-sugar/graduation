# YumeCore

**YumeCore（梦核）** 是一个面向 **二次元创作与委托撮合** 的全栈 Web 应用：以 **OC（原创角色）、世界观设定、表情包/贴纸** 等作品为内容核心，配套 **约稿广场**、**站内私信**、**互动与通知**、**Socket.io 实时推送**。支付与交付流程为 **演示级模拟**，适合作为作品集展示、同人创作社区原型或二次开发基础，而非已对接真实支付的商用交易平台。

### 文档导读（给其他 AI 与协作者）

- **先读「一、产品定位与目标用户」**：理解为谁解决什么问题、哪些能力在 UI 里、哪些只在 API 层。
- **再读「二、功能清单」与「三、前端路由」**：建立端到端心智模型（页面 ↔ 接口）。
- **本地运行**：见「六、环境变量与本地运行」；**联调契约**：「九～十二」节（认证、WebSocket、约稿私信前缀、HTTP API 表）。
- **改 UI / 改业务**：「十三、关键源码索引」「十四、作品分类与卡片 JSON」。
- **数据与运维**：「四」Prisma 模型、「十五～十六」脚本与迁移、「十七」安全与已知债、「十八」排错。

**技术栈快照**：前端 **React 19 + TypeScript + Vite 7 + React Router 7 + socket.io-client**；后端 **NestJS 11 + Prisma 6 + MySQL**；认证为 **JWT（访问令牌）+ Session 表（刷新令牌哈希）**；实时层 **Socket.io**（`ChatGateway` / `ChatPushService`）。

---

## 一、产品定位与目标用户

### 1.1 产品要解决什么

1. **展示与发现**：用瀑布流与分类卡片展示 OC / 世界观 / 表情包等多模板内容，支持搜索、推荐、关注流与个人主页聚合。
2. **社交互动**：点赞、收藏、浏览记录、树形评论与 **评论点赞**（登录用户）；关注与粉丝关系；未登录时的统一操作提示。
3. **委托撮合（演示）**：在广场区分 **「我来约稿招人」**（`direction=commission`）与 **「我来接稿」**（`direction=offer`），通过 **私信中的结构化消息前缀 + JSON** 串联申请、确认、模拟付款、交稿与验收，并用 WebSocket 刷新收件箱与约稿状态。

### 1.2 目标用户画像

| 用户类型 | 需求与动机 | 在站内主要行为 |
|----------|------------|----------------|
| **OC / 世界观作者** | 建立角色或设定档案、多图展示、控制「是否可被他人世界观关联」 | 工作站发布作品、编辑已发布作品、管理 `ocPrivacy`、从广场或关注流获取反馈 |
| **画师 / 接稿方** | 展示例图与接稿条、响应委托 | 发布 `offer` 接稿帖、应征 `commission` 招人帖、私信沟通、走交付与修改流程 |
| **委托方 / 甲方** | 寻找画风匹配的画师、跟进进度 | 发布 `commission` 招人帖、浏览接稿帖、确认申请、（模拟）付款、验收稿件 |
| **读者与同人爱好者** | 浏览、收藏、轻量互动 | 未登录可逛首页与公开主页；登录后点赞、评论、关注、收通知 |
| **站长 / 开发者** | 部署演示环境、灌种子数据、二次开发 | Prisma 迁移与 `backend/scripts` 维护脚本、`seed.ts` |

**非目标（当前版本刻意不覆盖）**：真实支付网关与法务合同、版权存证、复杂纠纷仲裁、站外 IM 全量替代、大规模内容审核后台。

### 1.3 站内角色与典型行为（与路由对应）

| 角色 | 典型行为 |
|------|----------|
| 访客 | 浏览作品与约稿列表、查看用户公开主页 |
| 登录用户 | 发布/编辑/删除自己的作品、点赞/收藏/评论、关注、发私信、管理「我的约稿」、处理约稿申请与交付 |
| 发约方 / 接稿方 | 在广场发布 **约稿帖**（`direction=commission`）或 **接稿帖**（`direction=offer`），通过私信里的结构化卡片完成申请、确认、（模拟）支付、交稿与验收 |

首页作品区支持 **「我的作品 / 关注 / 推荐」** 与 **OC、世界观、表情包** 等分类（`HomePage.tsx` 中 `categoryOptions`；库内历史 `novel` / `comic` / `nienien` 等 slug 在 `normalizeArtworkKind` 中归一为 **OC 卡片** 展示，见 `src/artwork/apiCategory.ts`）。**列表卡片**为统一外壳（`ArtworkCardShell`）+ 按规范化类目切换的中间区（`ArtworkCategoryCardInner`），实现见 `src/components/artwork/`。

### 1.4 系统架构总览（Mermaid）

下图概括 **浏览器 ↔ 后端 ↔ 数据与文件** 的关系；开发环境下 `/api`、`/uploads`、`/socket.io` 由 Vite 代理到 `localhost:3000`，详见第六节。

```mermaid
flowchart LR
  subgraph Browser["浏览器"]
    FE["React 前端\n(Vite)"]
    SIO["socket.io-client\n(NotificationSocketBridge 等)"]
  end

  subgraph Nest["NestJS :3000"]
    API["HTTP /api\nControllers + Services"]
    GW["WebSocket\nChatGateway + ChatPushService"]
  end

  DB[("MySQL\n(Prisma)")]
  FS["静态文件\nbackend/uploads"]

  FE -->|"REST /api"| API
  FE -->|"GET /uploads/..."| FS
  SIO <-->|"path: /socket.io\nJWT in auth"| GW
  API --> DB
  API --> FS
  API -->|"业务写库后推送\nuser:* / artwork:*"| GW
```

---

## 二、功能清单（按域）

### 2.0 全局 UI 与上下文

- **首页顶栏搜索**：仅在路由 `/` 时，`NavBar` 通过 `HomeSearchContext` 与首页瀑布流联动（防抖查询，请求 `GET /api/artworks/search?q=`）。
- **未登录提示**：`AuthPromptProvider` + `AuthPromptPanel`，用于在需要登录的操作处统一弹层/嵌入提示。
- **多端布局**：`index.html` 使用 `viewport-fit=cover`；根样式提供动态视口与安全区变量，全屏页（如 `/inbox`）高度与顶栏偏移与之一致。

### 2.1 作品（Artworks）

- 列表与筛选：`GET /api/artworks`（可按 `authorId`）、推荐 `GET /api/artworks/recommended`、我的 `GET /api/artworks/mine`、关注流 `GET /api/artworks/following`、收藏列表 `GET /api/artworks/favorites`
- 搜索：`GET /api/artworks/search?q=`（可选登录，用于首页顶栏搜索）
- 关联 OC 候选：`GET /api/artworks/linkable-ocs?q=`（可选登录；仅 `category=oc` 且 `ocPrivacy` 为 `public` 或 `null` 的作品，供世界观等工作站流程挑选）
- **按世界观反查已关联的 OC**（可选登录，用于世界观详情「相关 OC」等）：`GET /api/artworks/linked-worldview/:worldviewArtworkId/ocs`
- 详情：`GET /api/artworks/:id`（可选登录，用于返回「是否已点赞」等）
- 互动（需登录）：点赞切换、记录浏览、收藏切换；发布作品 `POST /api/artworks`（OC 可带 **`ocPrivacy`**：`public` / `private`，控制是否出现在他人「可关联 OC」候选中；见 `CreateArtworkDto` 与 `artworks.service.ts`）
- **作者维护（需登录）**：`PATCH /api/artworks/:id` 更新正文/封面/标签等（`UpdateArtworkDto`，仅作者）；`DELETE /api/artworks/:id` 删除自己的作品
- `description` 存 **`@db.Text`** 长文本；多图与卡片 JSON 仍通过 description 尾部块承载（见下节与第十四节）
- 前端页面：`/`（首页瀑布流）、`/studio`（工作站）、`/studio/pick-worldview`、`/studio/pick-linked-oc`（从工作站进入的全屏挑选页，**无主导航栏**）、`/artwork/:id`（详情，**无主导航栏**）、`/my-artworks/:id/edit`（**编辑已发布作品**，从详情页「编辑」进入，带主导航栏）
- **多图与卡片展示元数据**：后端仍为单字段 `imageUrl` + `description`。工作站发布时可将 **主封面 + 额外上传图** 依次 `POST /api/upload`，首张写入 `imageUrl`，其余 URL 与分类展示字段一并序列化进 **description 尾部的 JSON 块**（标记 `<<<OC_WEB_CARD_JSON>>>`，类型定义与解析见 `src/artwork/cardPayload.ts`）。详情页展示正文时会 **剥离该 JSON**，避免用户看到机器块。

### 2.2 评论（Comments）

- `GET /api/artworks/:id/comments` 拉取树形评论（可选登录，用于返回「本人是否已赞某条评论」等扩展字段）
- `POST /api/artworks/:id/comments` 发表评论（支持回复，见 DTO）
- `POST /api/comments/:id/like` **评论点赞（需登录，`JwtAuthGuard`）**；持久化在 **`CommentLike`** 表（用户—评论唯一约束），并累加 `Comment.likes`；对他人评论点赞会生成 **`comment_like`** 类型通知（见 2.7）
- 与 **通知** 联动：对他人作品的点赞/评论/回复会写入 `Notification`（类型见 2.7）

### 2.3 用户与关注（Users / Follows）

- `GET /api/users/search?q=` 用户搜索
- `GET /api/users/me`、`PATCH /api/users/me` 当前用户资料（头像/背景坐标、简介、地区、关注自动回复文案等，见 `PatchMeDto`）
- `GET /api/users/me/following`、`GET /api/users/me/followers`
- `POST/DELETE /api/users/:id/follow` 关注/取关
- `GET /api/users/:id` 公开主页；`GET /api/users/:id/likes-artworks` 对方点赞过的作品列表（可选登录）；`PATCH /api/users/:id` 修改用户资料（JWT，**仅当路径 `id` 与当前登录用户一致**，否则 `403`；与 `PATCH /users/me` 并存，前端以 `me` 为主）
- 前端：`/me`、`/me/follows`、`/profile/edit`、`/user/:id`

### 2.4 认证与会话（Auth）

- `POST /api/auth/register`、`POST /api/auth/login`：返回访问令牌并建立服务端 **Session**（刷新令牌哈希、UA/IP、过期与吊销）
- `POST /api/auth/refresh`：用刷新令牌换新访问令牌
- `POST /api/auth/logout`（单设备）、`POST /api/auth/logout-all`
- `GET /api/auth/sessions`、`DELETE /api/auth/sessions/:id` 会话列表与撤销
- JWT：`JwtAuthGuard` / `OptionalJwtAuthGuard`；密钥 `JWT_SECRET`（未配置时有开发用默认值，**生产必须设置**）
- 前端：`/login`、`/register`，状态在 `AuthContext`

### 2.5 约稿（Commissions）

**方向（`direction`）**

- `commission`：**我来约稿招人** —— 发帖人（发布者 / 交稿方）记在 `clientId`；**付款与验收方**为 `artistId`（应征成功的画师一侧）。
- `offer`：**我来接稿找工作** —— 发帖人记在 `artistId`；**付款与验收方**为 `clientId`（客户一侧）。

（发布者 = `getPublisherId`，付款方 = `getPayerId`，交稿接口仅允许发布者调用。）

**广场列表**：`GET /api/commissions`，无 `clientId`/`artistId` 筛选时，仅展示仍可申请的公开稿：`status ∈ { new, pending }`；可按 `direction` 过滤。

**单条**：`GET /api/commissions/:id`（可选登录）；发布者修改 `PATCH`、删除 `DELETE`。

**业务接口（节选，均需登录且带权限校验）**

- **付款方**（`getPayerId`）支付与取消：`POST /api/commissions/:id/pay`、`POST /api/commissions/:id/cancel-payment`
- **发布者**交稿：`POST /api/commissions/:id/deliver`（可多次提交，`finalize` 控制是否进入待验收等）
- **付款方**验收：`POST /api/commissions/:id/accept`、`POST /api/commissions/:id/reject-review`（接口注释称承接方；与 `getPayerId` 一致）
- 交付文件聚合：`GET .../delivery-files`、`GET .../publisher-delivery-items`、移除某次交付文件 `POST .../publisher-delivery-file/remove`

**状态机（字符串枚举，由后端写入与校验）**

- 稿件 `status`（主线）：`new` / `pending` → `payment-pending` → `wip` → `review-pending` → `done`。**付款方**（与 `getPayerId` 一致）调用 **`reject-review`** 时当前实现将状态置回 **`wip`** 并更新 `lastDeliveryRoundAt`（与「本轮交付」统计配合）；库内或旧数据仍可能出现 **`revising`** 时，部分逻辑按「进行中」同类处理。发布者在 `new`、`pending` 可编辑（进入待支付且已绑定承接方后受限，见 `commissions.service.ts`）
- 支付 `paymentStatus`：`unpaid`、`partial`、`paid`（具体转换见 `commissions.service.ts`）

**与私信的结合**：申请卡、交付、支付取消等通过 **消息正文约定前缀** + JSON（完整列表见 **第十一节**）；`Commission` 上有 `updatedAt`、`lastDeliveryRoundAt` 等字段配合「本轮申请/本轮交付」逻辑。

**对话侧辅助接口**

- `GET /api/conversations/commission-applications` 收件箱视角的申请列表
- `POST .../commission-applications/:id/confirm|reject` 确认或拒绝申请

前端页面：`/commissions`、`/commissions/new`、`/commissions/:id`、`/commissions/:id/edit`、`/my-commissions`。

### 2.6 私信（Conversations / Messages）

- `GET /api/conversations` 会话列表；`POST /api/conversations` 按对方用户 get-or-create
- `GET /api/conversations/:id`、`GET .../:id/messages`、`POST .../:id/messages` 发消息（`content` 为 TEXT，可很长）
- `POST .../:id/read` 已读；`DELETE /api/conversations/:id` 删除会话
- 前端：`/inbox` 及消息相关组件（`MessageSidebar`、`MessageList`、`MessageDetail`）

### 2.7 通知（Notifications）

- `GET /api/notifications`（支持 `unreadOnly`、`type`）、`GET /api/notifications/unread-count`
- `PATCH /api/notifications/:id/read`、`PATCH /api/notifications/read-all`
- 服务端 `NotificationType`（`notifications.service.ts`）：**`like`**（作品赞）、**`comment_like`**（评论赞）、**`comment`**（评论）、**`reply`**（回复）；存储于 `Notification.type` 字符串字段

### 2.8 上传（Upload）

- `POST /api/upload`（multipart，字段名 `file`），JWT 保护；文件落盘 `backend/uploads/`，单文件上限 10MB
- 静态访问：`http://<host>:3000/uploads/...`（与 `main.ts` 中 `useStaticAssets` 一致）

### 2.9 实时（Realtime）

- **Socket.io** 网关：`ChatGateway`，连接时可带 `auth.token` 或 `query.token`（JWT）；无 token 时以访客连接
- `ChatPushService` 等在业务层发消息/通知时推送到房间，前端用 `socket.io-client` + `NotificationSocketBridge` 等桥接 UI（**事件名与房间见第十节**）

---

## 三、前端路由一览

| 路径 | 说明 |
|------|------|
| `/` | 首页作品流 |
| `/studio` | 工作站（发布作品；类目表单与预览） |
| `/studio/pick-worldview` | 工作流内挑选世界观（全屏、无顶栏） |
| `/studio/pick-linked-oc` | 工作流内挑选可关联 OC（全屏、无顶栏） |
| `/commissions` | 约稿广场 |
| `/my-commissions` | 与我相关的约稿 |
| `/commissions/new` | 发布约稿/接稿帖 |
| `/commissions/:id` | 约稿详情 |
| `/commissions/:id/edit` | 编辑（须注意路由顺序，已在 `App.tsx` 中处理） |
| `/inbox` | 私信 |
| `/me` | 个人中心 |
| `/me/follows` | 关注管理 |
| `/login`、`/register` | 登录注册 |
| `/profile/edit` | 编辑资料 |
| `/artwork/:id` | 作品详情（该路由下隐藏主导航栏） |
| `/my-artworks/:id/edit` | 编辑自己的已发布作品（从详情页进入；带主导航栏） |
| `/user/:id` | 用户公开主页 |
| `*` | 回退到 `/` |

### 3.1 前端页面与能力对照（简表）

下表说明 **当前仓库里「哪个页面」主要用到哪些接口**，并标出 **仅有后端、尚未做专门管理页** 的能力。细粒度交互（卡片动效、轮询间隔等）仍以源码为准。

| 路由 | 页面 / 组件侧重 | 主要调用的能力 | 备注 |
|------|------------------|----------------|------|
| `/` | 瀑布流、分类与推荐、**顶栏搜索** | `GET /api/artworks`、`/recommended`、`/search` 等 | 未登录可浏览；登录后可带 Optional JWT；搜索词经 `HomeSearchContext` 防抖 |
| `/studio` | 工作站：`StudioWorkstation` 选类目 → **分类字段**（`CategoryFieldsRenderer` + `studioFormFields.ts`）→ **分类实时预览**（`CategoryPreviewBody.tsx`）→ 发布 | `POST /api/upload`、`POST /api/artworks`、`GET /api/users/search`、`GET /api/artworks/linkable-ocs` 等 | OC 为左侧主图 + 右侧详情式表单；世界观等可走子路由挑选关联 OC。正文与卡片 JSON 由 `mergeDescriptionWithCardPayload`（`src/utils/studioArtwork.ts`）合并 |
| `/studio/pick-worldview`、`/studio/pick-linked-oc` | 从工作站进入的挑选页 | `GET /api/artworks/linkable-ocs`、作品列表/详情等 | 路由下隐藏主导航；选毕返回工作站 |
| `/commissions` | 约稿广场列表 | `GET /api/commissions` | 可按 `direction` 等查询 |
| `/my-commissions` | 与我相关的约稿 | 约稿相关 GET + Socket `commission:inbox-refresh` 等 | 与收件箱红点逻辑有交集 |
| `/commissions/new`、`/:id`、`/:id/edit` | 发帖、详情、编辑 | `POST/PATCH/GET/DELETE /api/commissions` 等 | 详情内会发 `__COMMISSION_CARD__` 等私信 |
| `/inbox` | 会话列表与聊天、约稿卡片 | `conversations` 全套 API + Socket `chat:message` | 通过 `setInboxPageHandlesChatUnreadRefresh` 与全局桥接协调未读 |
| `/me` | 个人瀑布流、收藏、关注/粉丝摘要 | `artworks`（mine/favorites）、`users/me/following` 等 | 布局与首页类似 |
| `/me/follows` | 关注列表管理 | `users/me/following` 等 | — |
| `/login`、`/register` | 登录注册 | `POST /api/auth/login`、`register` | 成功后写入 `AuthContext` + localStorage |
| `/profile/edit` | 改资料、头像/背景上传 | `PATCH /api/users/me`、`POST /api/upload` | — |
| `/artwork/:id` | 作品详情、点赞收藏评论、跳转编辑 | `artworks/:id`、`linked-worldview/.../ocs`（世界观相关 OC）、`comments`、`like`/`favorite`/`view`；Socket `join-artwork`、`artwork:comments-refresh` | 详情页隐藏主导航 |
| `/my-artworks/:id/edit` | 复用工作站能力编辑已有作品 | `GET/PATCH /api/artworks/:id`、`POST /api/upload` 等 | 仅作者；路由在 `App.tsx` 中注册 |
| `/user/:id` | 他人主页、对方作品与约稿展示 | `GET /api/users/:id` 及关联列表接口 | — |

**尚无独立 UI 的后端能力（需 Postman / 自建页或将来补页面）**

- `GET /api/auth/sessions`、`DELETE /api/auth/sessions/:id`：多设备会话列表与单设备吊销——当前前端仅使用登录、刷新、登出，**未提供「设备管理」页**。
- `POST /api/auth/logout-all`：若产品上需要「一键下线所有设备」，需在设置里补按钮并调用该接口。

---

## 四、数据模型要点（Prisma / MySQL）

定义见 `backend/prisma/schema.prisma`，核心实体包括：

- **User**：账号、资料、与作品/约稿/会话/关注/通知/Session 的一对多关系
- **Session**：刷新令牌哈希、设备信息、过期与吊销（多设备登录）
- **Artwork**：标题、**description（`@db.Text`）**、图、分类、标签、作者/可选画师、**`ocPrivacy`**（schema 注释：**OC** 表示是否可被他人世界观关联；**worldview / emoji** 等可作为列表可见性 `public` / `private`）、点赞数、浏览等；关联 **ArtworkLike**、**Favorite**、**View**、**Comment**
- **Comment**：树形回复、点赞计数；多对多 **CommentLike**（用户对评论点赞，唯一 `[userId, commentId]`）
- **Follow**：关注关系唯一约束
- **Conversation / Message / ConversationRead**：两人会话、消息、已读水位
- **Commission**：约稿帖字段 + `direction` + `clientId`/`artistId` + `status` + `paymentStatus` + 时间戳与 `lastDeliveryRoundAt` 等
- **Notification**：`like` / `comment_like` / `comment` / `reply` 等事件

迁移历史在 `backend/prisma/migrations/`；可选种子 `backend/prisma/seed.ts`（`npm run seed`）。

---

## 五、仓库结构

```
仓库根目录/
├── src/                      # React 前端
│   ├── App.tsx               # 路由与布局
│   ├── pages/                # 各业务页面
│   ├── components/           # 导航、筛选、约稿/消息/通知等；作品卡片见 `components/artwork/`
│   ├── artwork/              # 作品 category 规范化、description 内卡片 JSON 解析与拼接
│   ├── studio/               # 工作站表单字段、CategoryFieldsRenderer、分类预览体等
│   ├── utils/                # `studioArtwork.ts`：正文拼接、`mergeDescriptionWithCardPayload` 等
│   ├── contexts/             # `AuthContext`、`HomeSearchContext`、`AuthPromptContext` 等
│   ├── types/                # 前端类型
│   └── *.ts                  # 约稿文案/收件箱辅助逻辑等
├── public/
├── assets/                   # 仓库根静态资源（如 `commission-flowcharts/` 下的说明图，不参与 Vite 构建入口）
├── src/assets/               # 前端源码旁资源（如 OC 演示图；`npm run sync:oc-assets` 会拷到 `backend/uploads/`）
├── index.html
├── .env.example              # 前端 VITE_* 模板（可选）
├── vite.config.ts            # 开发代理：/api、/uploads、/socket.io → 后端
├── package.json
├── backend/
│   ├── .env.example          # 后端 DATABASE_URL / JWT_SECRET 模板（复制为 .env）
│   ├── src/
│   │   ├── main.ts           # 端口 3000、全局前缀 api、静态 uploads、CORS、WS
│   │   ├── app.module.ts
│   │   ├── prisma/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── artworks/
│   │   ├── comments/
│   │   ├── commissions/
│   │   ├── conversations/
│   │   ├── upload/
│   │   ├── notifications/
│   │   └── realtime/
│   ├── prisma/               # schema、migrations、seed.ts
│   ├── uploads/              # 运行时上传目录（勿忘备份与权限）
│   └── scripts/              # 一次性数据脚本（头像、种子稿、替换图等，按需手工执行）
└── README.md
```

---

## 六、环境变量与本地运行

### 6.1 配置文件应放在哪里

- **后端**：`AppModule` 使用 `ConfigModule.forRoot({ isGlobal: true })`，默认从 **启动 Nest 时的当前工作目录** 读取 `.env`。在 `backend/` 目录执行 `npm run dev` / `npm start` 时，请使用 **`backend/.env`**（与 `schema.prisma` 中 `env("DATABASE_URL")` 一致）。
- **前端**：Vite 会自动加载仓库根目录下的 **`.env`**、**`.env.local`**、**`.env.[mode]`**、**`.env.[mode].local`**（后者优先级更高；`local` 文件建议加入 `.gitignore`）。**当前业务源码尚未读取 `import.meta.env`**，下列 `VITE_*` 为 **推荐约定**，接入需在代码中统一替换硬编码的 `http://localhost:3000`。
- **勿将真实密钥提交到 Git**。仓库已提供示例文件：**`backend/.env.example`**（后端）、**`.env.example`**（前端 `VITE_*` 模板）；复制后改名为 `.env` 或 `.env.development` 等再填写。

### 6.2 后端 `backend/.env` 示例

```env
# 必填：MySQL（Prisma migrate / generate / 运行时均依赖）
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/DATABASE_NAME"

# 强烈建议生产设置；未设置时开发环境回退为代码内默认（见下表）
JWT_SECRET="your-long-random-secret"
```

**后端环境变量一览（当前代码实际读取的项）**

| 变量 | 是否必需 | 由谁读取 | 说明 |
|------|----------|----------|------|
| `DATABASE_URL` | **是** | Prisma CLI、`PrismaClient` | MySQL 连接串；格式见 [Prisma 文档](https://www.prisma.io/docs/orm/reference/connection-urls#mysql) |
| `JWT_SECRET` | 生产 **必须** | `auth.module.ts`（签发）、`jwt-auth.guard.ts`、`optional-jwt.guard.ts`、`chat.gateway.ts`（校验 WS） | 未设置时使用开发默认值 **`oc-web-dev-secret`**（**禁止用于生产**） |
| （无） | — | — | **HTTP 监听端口** 在 `main.ts` 中写死为 **`3000`**，未接 `PORT` 环境变量；改端口需改源码或自行扩展 |

**与 JWT 相关且写死在代码中的项**（非环境变量）：访问令牌过期时间在 `auth.module.ts` 的 `signOptions.expiresIn` 中为 **`7d`**；刷新与会话逻辑见 `auth.service.ts`。

### 6.3 前端环境变量（现状 + 推荐模板）

**现状**：大量页面与组件内使用常量 **`API_BASE_URL = "http://localhost:3000"`**（或等价字面量），用于：

- 将接口返回的 **相对路径**（如 `/uploads/...`）拼成绝对 URL 展示图片；
- **`socket.io-client`** 的 `io(API_BASE_URL, { path: "/socket.io", ... })`（如 `NotificationSocketBridge.tsx`、`InboxPage.tsx`、`ArtworkDetailPage.tsx`）。

REST 请求多数写作 **`fetch("/api/...")` 相对路径**，开发时由 **`vite.config.ts`** 代理到后端，**不依赖** `VITE_*`。

**部署到非 localhost 时**：必须要么 **同源反代**（页面与 `/api`、`/uploads`、`/socket.io` 同域，并逐步把图片/Socket 基址改为相对或从 `window.location.origin` 推导），要么 **改源码** 使上述常量读取环境变量。

**推荐在仓库根引入的 `.env` 模板（需配合代码改造后生效）**

```env
# 可选：API 与静态资源、Socket 的「站点根」
# 开发示例：http://localhost:3000
# 生产同源部署：留空，由代码使用 window.location.origin 或 ""
VITE_API_ORIGIN=http://localhost:3000
```

```env
# .env.production 示例（同源部署、且代码已支持读 VITE_API_ORIGIN 时）
# VITE_API_ORIGIN=
```

**Vite 变量命名规则**：仅 **`VITE_` 前缀** 会暴露给前端 bundle；不要在 `VITE_*` 中存放服务端密钥。

### 6.4 启动顺序

```bash
# 1) 数据库
cd backend
npm install
npx prisma generate
npx prisma migrate dev
# npm run seed   # 可选

npm run dev      # http://localhost:3000 ，API 前缀 /api
```

```bash
# 2) 前端（仓库根目录）
npm install
npm run dev      # 默认 Vite 端口，代理到 3000
```

### 6.5 部署与配置注意

- 前端多处将资源与 Socket 基址写为 **`http://localhost:3000`**（见 **6.3**）。换环境时需 **同源反代**、**改硬编码** 或 **接入 `VITE_API_ORIGIN` 等并统一封装 `apiBase`**，并同步调整 `vite.config.ts` 或生产环境 Nginx 的 `/api`、`/uploads`、`/socket.io` 路由。
- **移动端 / 刘海屏**：`index.html` 已启用 `viewport-fit=cover`；布局依赖 `env(safe-area-inset-*)` 与 `100dvh`（不支持时回退 `100vh`），全屏页高度与顶栏偏移见 `:root` 中的 `--oc-nav-offset`、`--oc-main-fill`。
- 生产环境请使用强随机 `JWT_SECRET`，并配置 HTTPS 与 Cookie/令牌安全策略（若你后续引入 Cookie 方案需另行设计）。

---

## 七、常用脚本

| 位置 | 命令 | 说明 |
|------|------|------|
| 根目录 | `npm run dev` | 前端开发 |
| 根目录 | `npm run build` | 前端构建（含 `tsc -b` 类型检查；存在 TS 错误时会失败） |
| 根目录 | `npm run lint` | ESLint |
| 根目录 | `npm run sync:oc-assets` | 将 `src/assets/oc_*.jpg` 覆盖同步到 `backend/uploads/`（见 `backend/scripts/sync-oc-assets-to-uploads.js` 头注释） |
| `backend/` | `npm run dev` | Nest 开发（ts-node-dev） |
| `backend/` | `npm run build` && `npm start` | 编译后用 node 运行 |
| `backend/` | `npm run prisma:migrate` | Prisma 迁移 |
| `backend/` | `npm run prisma:generate` | 生成 Client |
| `backend/` | `npm run seed` | 执行 `prisma/seed.ts` |
| `backend/` | `npm run seed:oc-uploads` 等 | 见 `backend/package.json`：`seed:*`、`sync:*`、`clear:*`、`apply:*`、`oc:*`、`worldview:*`、`bump:*`、`backfill:*` 等维护脚本 |

---

## 八、约稿端到端流程（概念走查）

本节把 **第二节 2.5** 里散落的接口串成一条「故事线」，便于联调与排错。角色名称用 **发布者**（发帖人）、**应征者**（点申请的一方）、**付款方**（实际付钱的一方，随 `direction` 在甲方/乙方之间切换，以后端 `getPayerId` / `getPublisherId` 逻辑为准）。

### 8.1 发帖与广场

1. 用户登录后 `POST /api/commissions` 发帖，指定 `direction`：`commission` 或 `offer`，并写入标题、类目、价格、可选预览图等。
2. 新帖 `status` 为 `new`，`paymentStatus` 为 `unpaid`；广场列表在未按用户筛选时只看到 `new` / `pending` 的帖子。

### 8.2 应征与确认（私信 + 申请接口）

1. 应征者向发布者发起会话（若尚无则 `POST /api/conversations`），在消息中发送带 `__COMMISSION_CARD__` 前缀的结构化内容（前端与 `conversations` / `commissions` 服务协作解析）。
2. 发布者在 **收件箱** 侧通过 `GET /api/conversations/commission-applications` 查看待处理申请；对某条调用 `confirm` 或 `reject`。确认后稿件进入双方认可的「待付款 / 进行中」等状态（具体以 `commissions.service.ts` 内事务为准），并可能把对方写为 `clientId` / `artistId` 中的另一方。

### 8.3 付款（模拟）

1. **`getPayerId` 对应用户**（`commission` 帖为画师，`offer` 帖为客户）调用 `POST /api/commissions/:id/pay`；取消未完成的付款约定可 `POST .../cancel-payment`（会推送 `__COMMISSION_PAYMENT_CANCELLED__` 类消息并可能把状态打回可重新征集）。
2. `paymentStatus` 会从 `unpaid` / `partial` 过渡到 `paid` 后，才允许进入后续 **交稿 / 改稿** 流程（服务端有多处断言）。

### 8.4 交稿、修改与验收

1. **发布者**（`getPublisherId`，即发帖并负责交文件的一方）通过 `POST /api/commissions/:id/deliver` 上传文件列表；可多次提交，`finalize` 决定是仅推送交付消息还是推进到待验收等状态。交付记录在会话里体现为 `__COMMISSION_DELIVERY__` 等前缀消息；`lastDeliveryRoundAt` 用于区分「本轮」交付（例如付款方打回验收后重新交稿）。
2. 付款方 `POST .../accept` 验收通过 → 稿件可标记为 `done`；`POST .../reject-review` 将状态退回 **`wip`** 并更新 `lastDeliveryRoundAt`，发布者需再次交付后再发起验收。
3. 在允许的阶段，发布方可通过 `GET .../publisher-delivery-items`、移除接口等管理已发出的交付文件。

### 8.5 编辑与删除

- 仅在 `new`、`pending` 等早期状态，发布者可 `PATCH /api/commissions/:id` 改文案/价格等；`PATCH` 里可改的 `status` 子集由白名单限制，避免前端写入非法进行中状态。
- `DELETE /api/commissions/:id` 由发布者删除自己的帖子（需满足服务内业务条件）。

### 8.6 联调时建议抓的重点

| 现象 | 可优先查 |
|------|----------|
| 广场看不到自己的帖 | 是否已变为非 `new`/`pending`；是否带了 `clientId`/`artistId` 筛选 |
| 申请按钮/卡片异常 | 消息 `content` 前缀与 JSON 是否与后端解析一致；`updatedAt` 与「本轮申请」过滤 |
| 无法交稿或验收 | `paymentStatus` 是否为 `paid`；当前 `status` 是否处于 `wip` / `revising` / `review-pending` 等允许集合 |
| 图片裂图 | 静态路径 `/uploads` 与前端 `API_BASE_URL` / 代理是否同源 |

```mermaid
flowchart LR
  A[new 发帖] --> B[pending 有申请/确认]
  B --> C[payment-pending / 付款流程]
  C --> D[paid + wip 制作与交付]
  D --> E[review-pending 待验收]
  E --> F[done 完成]
  E -->|reject-review| D
```

（上图为 **示意**；分支、回退与取消付款等细节以 `backend/src/commissions/commissions.service.ts` 为准。）

---

## 九、认证与令牌（实现细节）

### 9.1 HTTP 访问令牌

- 受保护接口使用请求头：`Authorization: Bearer <accessToken>`（见 `JwtAuthGuard`）。
- JWT 载荷类型见 `backend/src/auth/jwt-auth.guard.ts` 中 `JwtPayload`：`sub`（用户 id）、`username`、`type`（访问令牌应为 `access` 或未设）、`sid`（会话 id，对应 Prisma `Session.id`）。
- 访问令牌由 `JwtModule` 签发，默认过期时间在 `auth.module.ts` 的 `signOptions` 中配置（当前为 **7d**）。

### 9.2 刷新令牌与会话

- 登录/注册响应包含 `accessToken`、`refreshToken`、`sessionId` 及精简 `user` 对象；刷新接口 `POST /api/auth/refresh` 用 `refreshToken` 换新一套令牌。
- 服务端在 `Session` 表存储刷新令牌的 **哈希**、UA/IP、过期与吊销字段，支持 `logout` / `logout-all` / 按会话 id 撤销。

### 9.3 前端存储与续期（`AuthContext`）

- **localStorage** 键名：`oc_web_token`、`oc_web_refresh_token`、`oc_web_session_id`、`oc_web_user`。
- 应用启动时：若有刷新令牌与 sessionId，会在访问令牌缺失或 **60 秒内过期** 时主动 `refresh`；运行中每 **60 秒** 检查一次，若 **10 分钟内** 过期则静默刷新。
- **风险**：令牌在 `localStorage` 时，若存在 XSS，攻击者可窃取会话——生产环境需严控 CSP、依赖审计与输入转义。

### 9.4 WebSocket 与 JWT

- Socket 握手需 **access** 型 JWT（`payload.type !== "access"` 会断开），通过 `auth.token` 或 `query.token` 传入（见 `chat.gateway.ts`）。

---

## 十、WebSocket：房间、事件与前端桥接

### 10.1 连接方式

- 路径：`/socket.io`（与 Vite 代理一致）；前端在 `NotificationSocketBridge.tsx` 中 `io({ path: "/socket.io", auth: { token } })`，仅登录后建立连接。

### 10.2 房间（Room）

| 房间名 | 加入方式 | 用途 |
|--------|----------|------|
| `user:<用户 id>` | 连接时校验 JWT 成功后 `join` | 向指定用户推送私信、通知、约稿收件箱刷新 |
| `artwork:<作品 id>` | 客户端发 Socket 消息 `join-artwork` / `leave-artwork` | 仅在看板详情页等场景加入；用于评论刷新 |

### 10.3 服务端发出的事件（客户端订阅）

| 事件名 | 载荷概要 | 典型用途 |
|--------|----------|----------|
| `chat:message` | `{ conversationId, message }` | 对方发来私信，刷新会话列表/当前对话 |
| `notification:new` | `{}` | 点赞/评论/回复/@ 等新通知，刷新未读 |
| `commission:inbox-refresh` | `{ commissionId?: number }` | 约稿状态或申请变化，刷新「我的约稿」/详情 |
| `artwork:comments-refresh` | `{ artworkId }` | 作品评论区更新 |

推送入口集中在 `ChatPushService`（在写库后调用 `ChatGateway`）。

### 10.4 前端 DOM 事件（与 Socket 对齐）

`NotificationSocketBridge` 将 Socket 转为浏览器事件，便于多组件监听：

- `oc-notifications-updated`
- `oc-conversations-updated`（收件箱页可通过 `setInboxPageHandlesChatUnreadRefresh` 避免与 NavBar 竞态）
- `oc-commission-updated`（`CustomEvent`，`detail.commissionId` 可选）

---

## 十一、约稿相关私信协议（消息 `content` 前缀）

约稿流程大量依赖 **会话消息正文** 的约定前缀 + **JSON 后缀**（由后端写入或前端构造）。前后端解析入口示例：`MessageDetail.tsx`、`InboxPage.tsx`、`conversations.service.ts`、`commissions.service.ts`。

| 前缀 | 含义（概要） |
|------|----------------|
| `__COMMISSION_CARD__` | 应征/申请卡片，由应征者发出 |
| `__COMMISSION_APPLY_RESULT__` | 申请通过或拒绝结果（服务端写入） |
| `__COMMISSION_TAKEN_BY_OTHER__` | 提示稿件已被他人确认等竞争场景 |
| `__COMMISSION_PAYMENT__` | 付款相关结构化事件 |
| `__COMMISSION_PAYMENT_CANCELLED__` | 付款方取消付款约定 |
| `__COMMISSION_DELIVERY__` | 交付文件列表等（可与 `lastDeliveryRoundAt` 配合筛「本轮」） |
| `__COMMISSION_REVIEW_REJECTED__` | 验收打回 |
| `__COMMISSION_ACCEPTED__` | 验收通过 |
| `__COMMISSION_REVISED__` / `__COMMISSION_DELETED__` | 发布方改稿、删稿类系统消息（`kind` 等字段见服务内实现） |

普通文本消息与上述协议共存；服务端对 **以 `__COMMISSION_CARD__` 开头** 的内容有更长长度上限（见 `conversations.service.ts` 内校验）。

---

## 十二、HTTP API 速查表

以下路径均相对于 **`http://<host>:3000/api`**（开发时也可经 Vite 代理以同源 `/api` 访问）。

### 12.1 认证 ` /auth`

| 方法 | 路径 | 守卫 | 说明 |
|------|------|------|------|
| POST | `/register` | 无 | 注册并返回令牌 |
| POST | `/login` | 无 | 登录 |
| POST | `/refresh` | 无 | 刷新令牌 |
| POST | `/logout` | JWT | 单设备注销（body 含 session/refresh） |
| POST | `/logout-all` | JWT | 全部会话注销 |
| GET | `/sessions` | JWT | 会话列表 |
| DELETE | `/sessions/:id` | JWT | 吊销指定会话 |

### 12.2 用户 ` /users`

| 方法 | 路径 | 守卫 | 说明 |
|------|------|------|------|
| GET | `/search?q=` | 无 | 搜索用户 |
| GET/PATCH | `/me` | JWT | 当前用户读/改资料 |
| GET | `/me/following`、`/me/followers` | JWT | 关注列表 |
| POST/DELETE | `/:id/follow` | JWT | 关注/取关 |
| GET | `/:id` | 无 | 公开资料 |
| GET | `/:id/likes-artworks` | Optional JWT | 公开点赞作品（可选登录用于扩展字段） |
| PATCH | `/:id` | JWT | **仅允许修改自己的资料**（`user.id === id`，否则 `403`） |

### 12.3 作品 ` /artworks`

| 方法 | 路径 | 守卫 | 说明 |
|------|------|------|------|
| GET | `/`、`/recommended` | Optional JWT | 列表 / 推荐 |
| GET | `/search?q=` | Optional JWT | 标题/标签/作者等搜索 |
| GET | `/linkable-ocs?q=` | Optional JWT | 可关联的公开 OC 候选（工作站等） |
| GET | `/linked-worldview/:id/ocs` | Optional JWT | 某世界观作品已关联的 OC 列表 |
| GET | `/mine`、`/following`、`/favorites` | JWT | 个人与关系流 |
| GET | `/:id` | Optional JWT | 详情 |
| POST/DELETE | `/:id/like` | JWT | 点赞 |
| POST | `/:id/view` | JWT | 浏览记录 |
| POST/DELETE | `/:id/favorite` | JWT | 收藏 |
| POST | `/` | JWT | 发布作品 |
| PATCH | `/:id` | JWT | 作者更新作品 |
| DELETE | `/:id` | JWT | 作者删除作品 |

### 12.4 评论（控制器无类级前缀，挂在全局 `api` 下）

| 方法 | 路径 | 守卫 | 说明 |
|------|------|------|------|
| GET | `/artworks/:id/comments` | Optional JWT | 评论树 |
| POST | `/artworks/:id/comments` | JWT | 发表评论（支持 `parentId` 回复，见 DTO） |
| POST | `/comments/:id/like` | JWT | 评论点赞（写入 `CommentLike`） |

### 12.5 约稿 ` /commissions`

| 方法 | 路径 | 守卫 | 说明 |
|------|------|------|------|
| GET | `/` | 无 | 列表（广场规则见 2.5） |
| POST | `/` | JWT | 发帖 |
| GET | `/:id` | Optional JWT | 详情 |
| PATCH/DELETE | `/:id` | JWT | 发布者改帖/删帖 |
| POST | `/:id/pay`、`/:id/cancel-payment` | JWT | 付款与取消 |
| POST | `/:id/deliver` | JWT | 交稿 |
| POST | `/:id/accept`、`/:id/reject-review` | JWT | 验收 |
| GET | `/:id/delivery-files` 等 | JWT | 交付聚合与管理 |

### 12.6 会话 ` /conversations`（全部 JWT）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/` | 列表 / get-or-create |
| GET | `/commission-applications` | 约稿申请收件箱 |
| POST | `/commission-applications/:id/confirm`、`.../reject` | 处理申请 |
| GET | `/:id`、`/:id/messages` | 会话与消息 |
| POST | `/:id/messages` | 发送消息 |
| POST | `/:id/read` | 已读 |
| DELETE | `/:id` | 删除会话 |

### 12.7 其它

| 方法 | 路径 | 守卫 | 说明 |
|------|------|------|------|
| GET | `/notifications`、`/notifications/unread-count` | JWT | 通知列表与未读数 |
| PATCH | `/notifications/:id/read`、`/notifications/read-all` | JWT | 已读 |
| POST | `/upload` | JWT | 上传文件，返回 `/uploads/...` URL |

---

## 十三、关键源码索引（按任务）

| 你想做的事 | 建议优先打开的文件 |
|------------|-------------------|
| 改首页分类/瀑布流 | `src/pages/HomePage.tsx` |
| 改首页作品卡片模板（五类布局） | `src/components/artwork/ArtworkCardShell.tsx`、`ArtworkCategoryCardInner.tsx`、`ArtworkCard.tsx`（`Card.tsx` 为其 re-export） |
| 改卡片 JSON / 发布时合并逻辑 | `src/artwork/cardPayload.ts`、`src/utils/studioArtwork.ts`（`buildArtworkCardPayload`、`mergeDescriptionWithCardPayload`） |
| 改工作站分类表单与预览 | `src/studio/StudioWorkstation.tsx`、`CategoryFieldsRenderer.tsx`、`CategoryPreviewBody.tsx`、`studioFormFields.ts` |
| 改路由与壳布局 | `src/App.tsx`、`src/components/NavBar.tsx` |
| 登录态、存 token、静默刷新 | `src/contexts/AuthContext.tsx` |
| 首页顶栏搜索、防抖查询 | `src/contexts/HomeSearchContext.tsx`、`src/components/NavBar.tsx` |
| 未登录提示弹层 | `src/contexts/AuthPromptContext.tsx`、`src/components/auth/AuthPromptPanel.tsx` |
| 工作站挑选子页 | `src/pages/StudioPickWorldviewPage.tsx`、`StudioPickLinkedOcPage.tsx` |
| 世界观 / OC 关联与挑选记忆 | `src/studio/ocWorldviewLinks.ts`、`worldviewPickUiMemory.ts`、`worldviewLinkedOcPickUiMemory.ts` 等 |
| 全局 Socket 与浏览器事件 | `src/components/NotificationSocketBridge.tsx` |
| 私信 UI 与约稿卡片渲染 | `src/pages/InboxPage.tsx`、`src/components/MessageDetail.tsx` |
| 约稿详情与申请发送 | `src/pages/CommissionDetailPage.tsx` |
| 已发布作品编辑 | `src/pages/ArtworkEditPage.tsx` |
| 约稿列表/卡片 | `src/pages/CommissionsPage.tsx`、`src/components/CommissionCard.tsx` |
| 约稿文案/收件箱辅助 | `src/commissionDescriptionMeta.ts`、`src/commissionInboxHelpers.ts` |
| 后端入口、静态目录、端口 | `backend/src/main.ts` |
| 模块注册 | `backend/src/app.module.ts` |
| 约稿状态机与交付 | `backend/src/commissions/commissions.service.ts` |
| 申请确认、消息长度、系统消息 | `backend/src/conversations/conversations.service.ts` |
| WS 推送封装 | `backend/src/realtime/chat-push.service.ts`、`chat.gateway.ts` |
| 数据表定义 | `backend/prisma/schema.prisma` |
| 开发代理 | `vite.config.ts` |

---

## 十四、作品分类与前后端约定

- **首页筛选**（`HomePage.tsx` → `categoryOptions`）：视图模式 **`my-works` / `following` / `recommended`**，以及作品类目 **`oc` / `worldview` / `emoji`**（`CategoryOption` 见 `src/types/index.ts`）。前三个为前端视图，不直接等于 Prisma 里单条作品的 `category` 字段取值。
- **列表与卡片规范化**（`src/artwork/apiCategory.ts`）：当前 **`ArtworkKind`** 仅 **`oc` | `worldview` | `emoji`**。库内历史 slug **`nienien` / `novel` / `comic`** 在 `normalizeArtworkKind` 中一律映射为 **`oc`** 展示；若需把数据库里的旧值批量改写，可使用 `backend/scripts/migrate-nienien-to-oc.js`（仅处理 `nienien`）。
- 后端 `CreateArtworkDto` 中 `category` 仍为自由字符串；工作站发布时会写入与上述 slug 对齐的值。**OC** 另可写 **`ocPrivacy`**（`public`：可被世界观等工作流选为关联对象；`private`：不出现在 `GET /api/artworks/linkable-ocs` 候选中）。**世界观 / 表情包** 等类目可复用该字段表示 **列表是否对全站公开**（见 Prisma `Artwork` 模型注释）。
- **约稿帖**的 `category` 在种子与 UI 里常为人类可读中文（如「表情包」），与作品库的英文 slug 并存；广场若做类目筛选需注意两套命名。

### 14.1 前端类型与列表字段

- 瀑布流用的 `Artwork`（`src/types/index.ts`）除 `imageUrl`、`category` 外，还可带 **`description`、`tags`、`ocPrivacy`** 等（列表接口若返回则用于卡片摘要、标签条及解析尾部 JSON）。

### 14.2 多模板卡片（首页 / 个人页等）

- **外壳**：`ArtworkCardShell` — 点击、悬停、标题、作者头像与昵称、点赞/评论/浏览覆盖层。
- **中间区**：`ArtworkCategoryCardInner` 按 `normalizeArtworkKind(category)` 与 **卡片 JSON 中的 `kind`** 分支到 **OC / 世界观 / 表情包** 等布局（历史 `novel`/`comic` 数据走 OC 分支）。
- **入口组件**：`ArtworkCard.tsx`；`src/components/Card.tsx` 仅 `export { default } from "./artwork/ArtworkCard"`，兼容旧 import。

### 14.3 description 尾部的卡片 JSON（`<<<OC_WEB_CARD_JSON>>>`）

- **写入**：工作站发布时由 `mergeDescriptionWithCardPayload` 等合并 **`ArtworkCardPayloadV1`**（`v: 1`、`kind`、可选 `extraImageUrls` 及世界观 chips、表情包组图元数据等），详见 `src/artwork/cardPayload.ts`、`src/utils/studioArtwork.ts`。
- **读取**：`splitDescriptionAndCardPayload` 拆出 `prose` 与 `payload`；列表卡片用其驱动模板；**详情页**仅用 `prose` 作为 `ArtworkDetailPage` 的正文展示。
- **演进**：若未来 Prisma 增加 `metadata Json` 字段，可将同一 payload 迁出 `description`，前端解析可改为优先读字段、回退扫 description。

### 14.4 工作站（`/studio`）与分类 schema

- **字段定义**：`src/studio/studioFormFields.ts` — 工作站可选类目为 **OC、世界观、表情包** 三套字段（世界观含地域/阵营/冲突/规则等；表情包含组图与是否允许下载等）。
- **非 OC 表单**：`CategoryFieldsRenderer.tsx` — 统一「① 基础信息 → ② 封面与素材（多图）→ ③ 分类专属字段 → ④ 标签与可见性（含 OC 的 `ocPrivacy`）」。
- **OC 表单**：在 `StudioWorkstation.tsx` 内为「左主图 + 右详情式卡片」，含可选关联画师、`linkable-ocs` 相关挑选流程等。
- **实时预览**：`CategoryPreviewBody.tsx` — 按类目切换右侧预览，与首页卡片语义对齐。

---

## 十五、`backend/scripts` 数据脚本（手工执行）

以下均为 **Node 脚本**，在 `backend/` 目录按需运行（具体用法见各文件头部注释或参数）；**生产库执行前务必备份**。

| 文件 | 用途（概要） |
|------|----------------|
| `assign-avatar-from-uploads.js` | 从 uploads 分配头像 |
| `assign-avatars-oc28-39.js` | 指定用户范围头像批量赋值 |
| `apply-alice-bob-commission-covers.js` | 为演示约稿写入封面（与 `seed:alice-bob-commissions` 等配合） |
| `backfill-worldview-linked-oc-preview.js` | 回填世界观关联 OC 的预览数据 |
| `clear-oc-worldview-links.js` | 清理 OC 与世界观关联 |
| `delete-111-offers.js` | 删除特定 offer 数据 |
| `migrate-nienien-to-oc.js` | 将 `category = nienien` 的作品批量改为 `oc` |
| `reduce-users-to-12-avatars.js` | `npm run users:reduce-12`：精简用户并绑定 avatar1–12 |
| `replace-commission-images.js` | 替换约稿预览图 |
| `rewrite-artworks-content.js` | 批量改写作品文案 |
| `seed-alice-bob-commissions.js` | `npm run seed:alice-bob-commissions`：Alice/Bob 演示约稿 |
| `seed-artworks-oc28-39.js` | 为作品区间写入种子图等 |
| `seed-commissions.js` | 约稿通用种子 |
| `seed-oc-comments.js` | 评论种子 |
| `seed-oc-from-uploads.js` | `npm run seed:oc-uploads`：从 uploads 灌 OC 演示数据 |
| `set-all-oc-public.js` | `npm run oc:set-all-public`：批量将 OC 的 `ocPrivacy` 设为公开 |
| `sync-commission-covers.js` | `npm run sync:commission-covers`：同步约稿封面资源 |
| `sync-oc-assets-to-uploads.js` | 根目录 `npm run sync:oc-assets`：将 `src/assets/oc_*.jpg` 拷入 `backend/uploads/` |
| `upsert-alice-showcase-worldviews.js` | 写入 Alice 展示用世界观作品 |
| `upsert-alice-worldview.js` | 写入/更新 Alice 单条世界观数据 |
| `set-all-worldviews-public.js` | `npm run worldview:set-all-public`：批量将世界观类作品的可见性设为公开 |
| `seed-oc-gallery-from-cursor-assets.js` | `npm run seed:oc-gallery`：从资源目录灌 OC 画廊演示 |
| `seed-worldviews-from-cursor-assets.js` | `npm run seed:worldviews-cursor`：灌世界观演示数据 |
| `seed-commissions-cursor-images.js` | `npm run seed:commissions-cursor-images`：约稿演示图 |
| `clear-artwork-artist-ids.js` | `npm run clear:artwork-artist`：清空作品上的可选画师关联 |
| `bump-oc-likes-and-comments.js` | `npm run bump:oc-engagement`：调节 OC 类作品的赞与评论量（演示用） |
| `bump-oc-views.js` | `npm run bump:oc-views`：调节浏览量（演示用） |
| `backfill-notifications-for-seeded-comments.js` | `npm run backfill:comment-notifications`：为已有评论补通知 |

---

## 十六、Prisma 迁移与种子数据

- **迁移**：`backend/prisma/migrations/` 含初始化、`message.content` 改为 **TEXT**、`commission.updatedAt`、**`lastDeliveryRoundAt`**、`artwork.description` 改为 **TEXT**、**`artwork.ocPrivacy`**、**`CommentLike`（评论点赞表，如 `20260422120000_comment_like`）** 等；新环境执行 `npx prisma migrate deploy`（生产）或 `npm run prisma:migrate` / `migrate dev`（开发）。若评论接口报错提示缺少 `CommentLike` 表，说明迁移未执行到位，请在后端目录运行 `npx prisma migrate deploy`。
- **`prisma/seed.ts`（当前）**：**不会** `deleteMany`。会 `upsert` 共 **12 个用户**：`alice`（头像 `avatar1.jpg`，邮箱 `alice@example.com`）+ `avatar_02` … `avatar_12`（头像 `avatar2`…`avatar12`），默认密码 `password123`。请将 12 张图放在 `backend/uploads/`（若用 `.png` 改种子里的 `AVATAR_EXT`）。
- **精简到恰好 12 人并绑定头像**（会删其余用户及其作品/约稿/私信等）：`cd backend && npm run users:reduce-12`。要求库里已有 `username` 为 `alice` 的用户；优先保留 `avatar_02`…`avatar_12`，不足则按 id 补足，仍不足则创建 `member_XX`。
- 历史上曾存在「全库清空再灌演示数据」的种子版本，**已移除**；已丢失的约稿/作品只能依赖数据库备份恢复，种子无法还原。

---

## 十七、安全、隐私与已知技术债

1. **令牌在 localStorage**：若发生 XSS，会话可能被盗用；生产环境应配合 **CSP**、依赖审计、富文本/用户输入转义。高安全场景可考虑 **HttpOnly Cookie + CSRF**（需前后端较大改造）。
2. **CORS**：`main.ts` 中 `enableCors()` 对来源较宽松，生产应收紧白名单。
3. **上传**：单文件上限约 **10MB**、落盘 `backend/uploads/`；需防范恶意文件名、磁盘占满；生产建议 **对象存储 + CDN**，并对 MIME/扩展名做白名单校验。
4. **支付**：当前为 **模拟流程**，无真实支付网关；对接第三方支付时需独立设计订单、回调验签与幂等。
5. **限流**：`auth.controller.ts` 使用 `@nestjs/throttler`（`ThrottlerGuard`）对注册/登录等接口做节流，**并非全局限流**；若公网暴露，仍建议在网络边缘（CDN/WAF）叠加防护。
6. **权限模型**：作品与约稿的写操作以 **「资源作者 / 业务角色（付款方、发布者等）」** 在后端服务层校验为准；新增接口时需保持同一模式，避免仅依赖前端隐藏按钮。

---

## 十八、测试、构建与排错清单

### 18.1 自动化测试

- 仓库内 **未发现** Jest/Vitest 等 `*.spec.ts` 测试文件；回归依赖手工与接口调试。

### 18.2 构建

| 命令 | 产出 |
|------|------|
| 根目录 `npm run build` | `tsc -b` 类型检查 + Vite 产出 `dist/`（当前仓库若存在未修复的 TS 错误则会失败） |
| `cd backend && npm run build` | `backend/dist/`，`npm start` 运行 `main.js` |

### 18.3 常见问题（补充）

| 现象 | 排查方向 |
|------|----------|
| 401 大面积失败 | `Authorization` 头、`JWT_SECRET` 是否一致、时钟漂移 |
| Socket 连上立刻断 | 是否用了 refresh token；payload `type` 须为 `access` |
| 接口 404 | 是否漏写全局前缀 **`/api`** |
| 刷新后头像消失 | `localStorage` 与 `PATCH /users/me` 同步、`updateUser` 是否调用 |
| Prisma P2000/P2002 | 消息过长、唯一索引冲突（username/email） |
| 种子跑失败 | 多为 `username`/`email` 唯一冲突；当前种子仅 upsert 12 个 `avatar_*@oc-web.local`，先 `migrate` 再 `npm run seed` |
| 评论树 500 / 日志提示缺少 `CommentLike` | 在 `backend/` 执行 `npx prisma migrate deploy`（或 `npm run prisma:migrate`），与 `comments.service.ts` 内降级提示一致 |

---

## 十九、许可与性质

- 根目录 `package.json` 中 **`name` 为 `yumecore`**、`private: true`，属私有项目；若开源请自行添加 LICENSE 并审查脚本与种子数据是否适合公开。
