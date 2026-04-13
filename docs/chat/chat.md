# Chat History

## 2026-04-13 15:52

**User:** 我希望不改变 @[pnpm-lock.yaml]这个文件下组件的版本，需要注意些什么？

**Antigravity:** 为了确保 `pnpm-lock.yaml` 文件中的依赖版本保持绝对不变，您需要从操作流程、命令参数以及配置文件三个维度进行控制。以下是核心注意事项和具体操作建议：

### 1. 核心操作指令
在开发及 CI/CD 环境中，始终使用 **`frozen-lockfile`** 模式：
```bash
pnpm install --frozen-lockfile
```
- **作用**：如果 `pnpm-lock.yaml` 需要更新才能与 `package.json` 匹配，pnpm 会直接报错并退出，而不是修改 lock 文件。这是防止版本滑坡的最有效手段。

### 2. 锁定 package.json 中的版本
您目前的 `package.json` 中大量使用了 `^` 前缀（例如 `"ant-design-vue": "^1.7.8"`）。
- **建议**：去掉版本号前的 `^` 或 `~`，改为 **固定版本**：
  ```json
  "dependencies": {
    "ant-design-vue": "1.7.8",
    "axios": "0.26.1"
  }
  ```
- **原因**：即便有 lock 文件，如果手动删除了 `node_modules` 并重新执行不带参数的 `pnpm install`，非固定版本仍有极小概率因依赖树冲突导致重新计算。

### 3. 禁止使用的命令
严禁在需要保持稳定的环境下运行以下命令：
- **`pnpm update`**：会主动检索并升级版本。
- **`pnpm audit --fix`**：在修复漏洞时会强制更改底层依赖树。

### 4. 项目级配置 (.npmrc)
您可以在项目根目录的 `.npmrc` 中添加配置，使其系统性地保持锁定状态：
```ini
frozen-lockfile=true
```
这样即便执行普通的 `pnpm install`，默认也会开启“冻结”模式。

### 5. 关于间接依赖（Transitive Dependencies）
`pnpm-lock.yaml` 的价值在于锁定了**所有深度嵌套**的间接依赖。只要不触发 lock 文件的重新生成，所有子依赖的版本也会保持一致。如果发现 lock 文件非预期变动，通常是因为：
- `package.json` 被手动修改了。
- 使用了不同版本的 `pnpm` 客户端。建议在 `engines` 中锁定 pnpm 版本。
