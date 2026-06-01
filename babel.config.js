const IS_PROD = ['production', 'prod'].includes(process.env.NODE_ENV)
const IS_PREVIEW = process.env.VUE_APP_PREVIEW === 'true'
// Jest 运行时 NODE_ENV 为 'test':此时按需加载的 antd `es` 样式文件(.less)
// 无法被 jest 解析(node_modules 内的 ESM 样式 import),组件测试也不需要真实样式。
// 因此在 test 环境关闭样式注入(`style: false`),只保留组件 JS 的按需加载。
const IS_TEST = process.env.NODE_ENV === 'test'

const plugins = []
if (IS_PROD && !IS_PREVIEW) {
  // 去除日志的插件，
  plugins.push('transform-remove-console')
}

// lazy load ant-design-vue
// if your use import on Demand, Use this code
plugins.push(['import', {
  'libraryName': 'ant-design-vue',
  // test 环境改用 CommonJS 的 `lib` 目录(jest 默认不转换 node_modules,
  // 而 `es` 为 ESM 会触发 "Cannot use import statement outside a module");
  // 运行/构建仍使用 `es` 以支持 tree-shaking 与按需样式。
  'libraryDirectory': IS_TEST ? 'lib' : 'es',
  'style': !IS_TEST // `style: true` 会加载 less 文件;test 环境关闭以避免 jest 解析样式失败
}])

module.exports = {
  presets: [
    '@vue/cli-plugin-babel/preset',
    [
      '@babel/preset-env',
      {
        'useBuiltIns': 'entry',
        'corejs': 3
      }
    ]
  ],
  plugins
}
