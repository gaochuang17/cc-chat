import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

/**
 * Markdown 渲染器：将 AI 返回的 Markdown 文本渲染为带格式的 React 元素。
 *
 * 依赖库分工：
 *   - react-markdown：解析 Markdown 字符串为 React 元素
 *   - remark-gfm：插件，支持 GitHub 扩展语法（表格、删除线、任务列表）
 *   - react-syntax-highlighter：代码块语法高亮
 *   - oneDark：暗色代码高亮主题
 */
export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // 自定义 code 元素渲染：区分行内代码和代码块
        code({ node, className, children, ...props }: any) {
          // 代码块的 className 形如 "language-python"，行内代码没有 className
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !className

          if (isInline) {
            // 行内代码：直接渲染 <code> 标签，样式由 CSS 控制
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          }

          // 代码块：用 SyntaxHighlighter 做语法高亮
          return (
            <SyntaxHighlighter
              style={oneDark as any}
              language={match ? match[1] : 'text'}
              PreTag="pre"
            >
              {String(children).replace(/\n$/, '') /* 去掉末尾多余换行 */}
            </SyntaxHighlighter>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
